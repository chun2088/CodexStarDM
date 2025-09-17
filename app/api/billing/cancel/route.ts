import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { recordEvent } from "@/lib/event-service";
import { getSupabaseAdminClient } from "@/lib/supabase-client";
import {
  fetchStoreById,
  fetchStoreByOwner,
  upsertStoreSubscription,
  type StoreRecord,
  type StoreSubscriptionRecord,
  type StoreSubscriptionStatus,
} from "@/lib/store-service";

const ACCESS_TOKEN_COOKIE_NAME = "sb-access-token";

async function extractAccessToken(request: Request) {
  const authHeader = request.headers.get("authorization") ?? request.headers.get("Authorization");

  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length).trim();
    if (token) {
      return token;
    }
  }

  const cookieStore = await cookies();
  const cookieToken = cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value;
  return cookieToken ?? null;
}

type CancelSubscriptionRequest = {
  storeId?: string;
  graceUntil?: string | null;
  reason?: string | null;
  refundAmount?: number | null;
  refundCurrency?: string | null;
  refundNote?: string | null;
};

type AuthenticatedMerchant = {
  merchantId: string;
  store: StoreRecord;
};

function asTrimmedString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function coercePositiveNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function parseIsoDate(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

async function authenticateMerchant(
  request: Request,
  supabase = getSupabaseAdminClient(),
): Promise<AuthenticatedMerchant | { error: NextResponse }> {
  const accessToken = await extractAccessToken(request);

  if (!accessToken) {
    return {
      error: NextResponse.json({ error: "Authentication required" }, { status: 401 }),
    } as const;
  }

  const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);

  if (authError || !authData?.user) {
    console.error("Failed to verify Supabase access token", authError);
    return {
      error: NextResponse.json({ error: "Invalid or expired session" }, { status: 401 }),
    } as const;
  }

  const merchantId = authData.user.id;

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("id, role")
    .eq("id", merchantId)
    .maybeSingle();

  if (profileError) {
    console.error("Failed to load merchant profile", profileError);
    return {
      error: NextResponse.json({ error: "Unable to verify merchant" }, { status: 500 }),
    } as const;
  }

  if (!profile) {
    return {
      error: NextResponse.json({ error: "Merchant profile not found" }, { status: 404 }),
    } as const;
  }

  if (profile.role !== "merchant") {
    return {
      error: NextResponse.json({ error: "Only merchants can manage billing" }, { status: 403 }),
    } as const;
  }

  let store: StoreRecord | null = null;

  try {
    store = await fetchStoreByOwner(supabase, merchantId);
  } catch (error) {
    console.error("Failed to resolve merchant store", error);
    return {
      error: NextResponse.json({ error: "Unable to resolve merchant store" }, { status: 500 }),
    } as const;
  }

  if (!store) {
    return {
      error: NextResponse.json({ error: "Store not found for merchant" }, { status: 404 }),
    } as const;
  }

  return { merchantId, store } satisfies AuthenticatedMerchant;
}

function normalizeCurrency(value: unknown) {
  const trimmed = asTrimmedString(value);
  return trimmed ? trimmed.toUpperCase() : null;
}

export async function POST(request: Request) {
  let payload: CancelSubscriptionRequest;

  try {
    payload = await request.json();
  } catch (error) {
    console.error("Failed to parse cancellation payload", error);
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { storeId: storeIdInput } = payload ?? {};

  const supabase = getSupabaseAdminClient();
  const authResult = await authenticateMerchant(request, supabase);

  if ("error" in authResult) {
    return authResult.error;
  }

  const { merchantId } = authResult;
  let store = authResult.store;

  const normalizedStoreId = asTrimmedString(storeIdInput);

  if (normalizedStoreId && normalizedStoreId !== store.id) {
    try {
      const fetched = await fetchStoreById(supabase, normalizedStoreId);
      if (!fetched || fetched.owner_id !== merchantId) {
        return NextResponse.json({ error: "Store not found for merchant" }, { status: 404 });
      }

      store = fetched;
    } catch (error) {
      console.error("Failed to fetch requested store for cancellation", error);
      return NextResponse.json({ error: "Unable to resolve store" }, { status: 500 });
    }
  }

  const { data: subscriptionRow, error: subscriptionError } = await supabase
    .from("store_subscriptions")
    .select(
      "id, store_id, plan_id, billing_profile_id, status, current_period_start, current_period_end, grace_until, canceled_at, metadata",
    )
    .eq("store_id", store.id)
    .maybeSingle();

  if (subscriptionError) {
    console.error("Failed to load store subscription for cancellation", subscriptionError);
    return NextResponse.json({ error: "Unable to load store subscription" }, { status: 500 });
  }

  if (!subscriptionRow) {
    return NextResponse.json({ error: "Store subscription not found" }, { status: 404 });
  }

  const subscription = subscriptionRow as StoreSubscriptionRecord;

  if (subscription.status === "canceled") {
    return NextResponse.json(
      {
        message: "Subscription already canceled",
        subscription: {
          id: subscription.id,
          status: subscription.status,
          graceUntil: subscription.grace_until,
          canceledAt: subscription.canceled_at,
        },
        revokedBillingProfiles: [],
        subscriptionStatus: subscription.status,
      },
      { status: 200 },
    );
  }

  const now = new Date();
  const canceledAtIso = now.toISOString();

  const providedGrace = Object.prototype.hasOwnProperty.call(payload ?? {}, "graceUntil");

  let resolvedGrace: string | null = null;

  if (providedGrace) {
    if (payload.graceUntil === null) {
      resolvedGrace = null;
    } else {
      const parsedGrace = parseIsoDate(payload.graceUntil);
      if (!parsedGrace) {
        return NextResponse.json({ error: "graceUntil must be a valid ISO date" }, { status: 400 });
      }

      const effectiveGrace = parsedGrace < now ? now : parsedGrace;
      resolvedGrace = effectiveGrace.toISOString();
    }
  } else if (subscription.grace_until) {
    const graceDate = new Date(subscription.grace_until);
    resolvedGrace = (graceDate < now ? now : graceDate).toISOString();
  } else if (subscription.current_period_end) {
    const periodEnd = new Date(subscription.current_period_end);
    resolvedGrace = (periodEnd < now ? now : periodEnd).toISOString();
  } else {
    resolvedGrace = null;
  }

  const reason = asTrimmedString(payload.reason);
  const refundNote = asTrimmedString(payload.refundNote);

  const refundAmount = coercePositiveNumber(payload.refundAmount);

  if (refundAmount !== null && refundAmount < 0) {
    return NextResponse.json({ error: "refundAmount must be positive" }, { status: 400 });
  }

  const hasRefund = refundAmount !== null && refundAmount > 0;
  const refundCurrency = hasRefund ? normalizeCurrency(payload.refundCurrency) ?? "KRW" : null;

  const cancellationMetadata: Record<string, unknown> = {
    at: canceledAtIso,
    actor: "merchant",
  };

  if (reason) {
    cancellationMetadata.reason = reason;
  }

  if (resolvedGrace) {
    cancellationMetadata.graceUntil = resolvedGrace;
  }

  if (hasRefund) {
    cancellationMetadata.refund = {
      amount: refundAmount,
      currency: refundCurrency,
      ...(refundNote ? { note: refundNote } : {}),
    };
  }

  const eventDetails: Record<string, unknown> = {};

  if (reason) {
    eventDetails.reason = reason;
  }

  if (resolvedGrace) {
    eventDetails.graceUntil = resolvedGrace;
  }

  if (hasRefund) {
    eventDetails.refundAmount = refundAmount;
    eventDetails.refundCurrency = refundCurrency;
    if (refundNote) {
      eventDetails.refundNote = refundNote;
    }
  }

  let subscriptionStatus: StoreSubscriptionStatus = "canceled";
  let updatedSubscription: StoreSubscriptionRecord;

  try {
    updatedSubscription = await upsertStoreSubscription(supabase, store.id, {
      status: "canceled",
      planId: subscription.plan_id ?? null,
      billingProfileId: subscription.billing_profile_id ?? null,
      graceUntil: resolvedGrace,
      canceledAt: canceledAtIso,
      metadataPatch: {
        lastCancellation: cancellationMetadata,
      },
      event: {
        type: "billing.subscription_canceled",
        at: canceledAtIso,
        details: eventDetails,
      },
      eventContext: {
        actorId: merchantId,
      },
      eventSource: "api.billing.cancel",
    });

    subscriptionStatus = updatedSubscription.status;
  } catch (error) {
    console.error("Failed to update store subscription during cancellation", error);
    return NextResponse.json({ error: "Unable to update store subscription" }, { status: 500 });
  }

  const { data: activeProfiles, error: activeProfilesError } = await supabase
    .from("store_billing_profiles")
    .select("id")
    .eq("store_id", store.id)
    .eq("status", "active");

  if (activeProfilesError) {
    console.error("Failed to load active billing profiles for cancellation", activeProfilesError);
  }

  const revokedIds = (activeProfiles ?? []).map((profile) => profile.id as string);

  if (revokedIds.length > 0) {
    const { error: revokeError } = await supabase
      .from("store_billing_profiles")
      .update({ status: "revoked" })
      .in("id", revokedIds);

    if (revokeError) {
      console.error("Failed to revoke billing profiles during cancellation", revokeError);
    }
  }

  const invoicePayload = {
    type: hasRefund ? "refund" : "cancellation",
    issuedAt: canceledAtIso,
    amount: hasRefund ? refundAmount : null,
    currency: hasRefund ? refundCurrency : null,
    ...(refundNote ? { note: refundNote } : {}),
    ...(resolvedGrace ? { graceUntil: resolvedGrace } : {}),
    ...(reason ? { reason } : {}),
  };

  try {
    await recordEvent(supabase, {
      type: hasRefund ? "billing.invoice_refunded" : "billing.invoice_canceled",
      at: canceledAtIso,
      details: invoicePayload,
      context: {
        storeId: store.id,
        subscriptionId: updatedSubscription.id,
        planId: updatedSubscription.plan_id,
        billingProfileId: updatedSubscription.billing_profile_id,
        actorId: merchantId,
      },
      source: "api.billing.cancel",
    });
  } catch (error) {
    console.error("Failed to record cancellation invoice event", error);
  }

  return NextResponse.json(
    {
      message: "Subscription canceled",
      subscription: {
        id: updatedSubscription.id,
        status: updatedSubscription.status,
        graceUntil: updatedSubscription.grace_until,
        canceledAt: updatedSubscription.canceled_at,
      },
      revokedBillingProfiles: revokedIds,
      invoice: invoicePayload,
      refund: hasRefund
        ? {
            amount: refundAmount,
            currency: refundCurrency,
            processedAt: canceledAtIso,
            ...(refundNote ? { note: refundNote } : {}),
          }
        : null,
      subscriptionStatus,
    },
    { status: 200 },
  );
}
