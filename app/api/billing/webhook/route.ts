import { NextResponse } from "next/server";

import { recordEvent } from "@/lib/event-service";
import { getSupabaseAdminClient } from "@/lib/supabase-client";
import {
  calculatePeriodEnd,
  upsertStoreSubscription,
} from "@/lib/store-service";

type TossWebhookPayload = {
  eventType?: string;
  billingKey?: string;
  customerKey?: string;
  data?: Record<string, unknown> | null;
};

type SubscriptionPlanRow = {
  id: string;
  billing_interval: "day" | "week" | "month" | "year";
  interval_count: number;
};

const SUCCESS_EVENTS = new Set([
  "PAYMENT_APPROVED",
  "BILLING_APPROVED",
  "PAYMENT_SUCCEEDED",
]);

const FAILURE_EVENTS = new Set([
  "PAYMENT_FAILED",
  "BILLING_FAILED",
  "PAYMENT_DECLINED",
]);

const CANCEL_EVENTS = new Set([
  "BILLING_KEY_DELETED",
  "SUBSCRIPTION_CANCELED",
  "PAYMENT_CANCELED",
]);

function normalizeEventType(value: string) {
  return value.trim().toUpperCase();
}

function coerceTimestamp(value: unknown, fallback: string) {
  if (typeof value === "string" && value) {
    return value;
  }

  return fallback;
}

function safeDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date();
  }

  return date;
}

function asTrimmedString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function coerceNumber(value: unknown) {
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

function normalizeCurrency(value: unknown) {
  const trimmed = asTrimmedString(value);
  return trimmed ? trimmed.toUpperCase() : null;
}

function parseOptionalDate(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

export async function POST(request: Request) {
  let payload: TossWebhookPayload;

  try {
    payload = await request.json();
  } catch (error) {
    console.error("Failed to parse Toss webhook payload", error);
    return NextResponse.json(
      { error: "Invalid payload" },
      { status: 400 },
    );
  }

  const rawEventType = typeof payload.eventType === "string" ? payload.eventType : "";

  if (!rawEventType.trim()) {
    return NextResponse.json(
      { error: "eventType is required" },
      { status: 400 },
    );
  }

  const eventType = normalizeEventType(rawEventType);
  const billingKey = typeof payload.billingKey === "string" ? payload.billingKey : null;
  const customerKey = typeof payload.customerKey === "string" ? payload.customerKey : null;

  if (!billingKey && !customerKey) {
    return NextResponse.json(
      { error: "billingKey or customerKey is required" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdminClient();

  const { data: profileByKey } = billingKey
    ? await supabase
        .from("store_billing_profiles")
        .select("id, store_id, billing_key, customer_key, status")
        .eq("billing_key", billingKey)
        .maybeSingle()
    : { data: null };

  const { data: profileByCustomer } = !profileByKey && customerKey
    ? await supabase
        .from("store_billing_profiles")
        .select("id, store_id, billing_key, customer_key, status")
        .eq("customer_key", customerKey)
        .order("created_at", { ascending: false })
        .maybeSingle()
    : { data: null };

  const billingProfile = profileByKey ?? profileByCustomer;

  if (!billingProfile) {
    console.warn("Received Toss webhook for unknown billing profile", {
      eventType,
      billingKey,
      customerKey,
    });

    return NextResponse.json({ message: "No matching billing profile" }, { status: 202 });
  }

  const storeId = billingProfile.store_id;

  const { data: subscription, error: subscriptionError } = await supabase
    .from("store_subscriptions")
    .select("id, store_id, plan_id, current_period_end")
    .eq("store_id", storeId)
    .maybeSingle();

  if (subscriptionError) {
    console.error("Failed to load store subscription for webhook", subscriptionError);
    return NextResponse.json(
      { error: "Unable to load store subscription" },
      { status: 500 },
    );
  }

  const eventData = (payload.data && typeof payload.data === "object")
    ? (payload.data as Record<string, unknown>)
    : {};

  if (SUCCESS_EVENTS.has(eventType)) {
    const planId = subscription?.plan_id;
    let plan: SubscriptionPlanRow | null = null;

    if (planId) {
      const { data: planRow, error: planError } = await supabase
        .from("subscription_plans")
        .select("id, billing_interval, interval_count")
        .eq("id", planId)
        .maybeSingle();

      if (planError) {
        console.error("Failed to load plan for webhook", planError);
      } else {
        plan = planRow as SubscriptionPlanRow | null;
      }
    }

    const nowIso = new Date().toISOString();
    const approvedAt = coerceTimestamp(eventData.approvedAt, nowIso);
    const startDate = safeDate(approvedAt);
    const interval = plan?.billing_interval ?? "month";
    const count = plan?.interval_count ?? 1;
    const nextPeriod = calculatePeriodEnd(startDate, interval, count);

    try {
      const subscriptionRecord = await upsertStoreSubscription(supabase, storeId, {
        status: "active",
        planId: planId ?? null,
        billingProfileId: billingProfile.id,
        currentPeriodStart: startDate.toISOString(),
        currentPeriodEnd: nextPeriod.toISOString(),
        graceUntil: nextPeriod.toISOString(),
        metadataPatch: {
          lastWebhookEvent: eventType,
          lastPayment: {
            orderId: eventData.orderId ?? null,
            paymentKey: eventData.paymentKey ?? billingKey ?? null,
            approvedAt: approvedAt,
          },
        },
        event: {
          type: `billing.webhook_${eventType.toLowerCase()}`,
          at: startDate.toISOString(),
          details: {
            orderId: eventData.orderId ?? null,
            paymentKey: eventData.paymentKey ?? null,
          },
        },
        eventSource: "api.billing.webhook",
      });

      return NextResponse.json(
        {
          status: "processed",
          subscriptionId: subscriptionRecord.id,
        },
        { status: 200 },
      );
    } catch (error) {
      console.error("Failed to update subscription for success webhook", error);
      return NextResponse.json(
        { error: "Unable to update subscription state" },
        { status: 500 },
      );
    }
  }

  if (FAILURE_EVENTS.has(eventType)) {
    const nowIso = new Date().toISOString();
    const failedAt = coerceTimestamp(eventData.failedAt, nowIso);
    const failureDate = safeDate(failedAt);

    let graceUntilIso = nowIso;

    if (subscription?.current_period_end) {
      const existingGrace = safeDate(subscription.current_period_end);
      graceUntilIso = existingGrace.toISOString();
    } else {
      const graceDate = calculatePeriodEnd(failureDate, "day", 3);
      graceUntilIso = graceDate.toISOString();
    }

    try {
      await upsertStoreSubscription(supabase, storeId, {
        status: "grace",
        planId: subscription?.plan_id ?? null,
        billingProfileId: billingProfile.id,
        graceUntil: graceUntilIso,
        metadataPatch: {
          lastWebhookEvent: eventType,
          lastPaymentError: eventData.message ?? null,
          lastPaymentOrderId: eventData.orderId ?? null,
          lastPaymentFailedAt: failedAt,
        },
        event: {
          type: `billing.webhook_${eventType.toLowerCase()}`,
          at: failureDate.toISOString(),
          details: {
            orderId: eventData.orderId ?? null,
          },
        },
        eventSource: "api.billing.webhook",
      });

      return NextResponse.json({ status: "grace" }, { status: 200 });
    } catch (error) {
      console.error("Failed to record grace period after payment failure", error);
      return NextResponse.json(
        { error: "Unable to update store subscription" },
        { status: 500 },
      );
    }
  }

  if (CANCEL_EVENTS.has(eventType)) {
    const now = new Date();
    const nowIso = now.toISOString();
    const canceledAt = coerceTimestamp(
      (eventData.canceledAt as string | undefined) ??
        (eventData.deletedAt as string | undefined) ??
        (eventData.cancelAt as string | undefined) ??
        (eventData.cancel_at as string | undefined),
      nowIso,
    );
    const canceledDate = safeDate(canceledAt);

    const graceKeys = [
      "graceUntil",
      "grace_until",
      "cancelAt",
      "cancel_at",
      "cancelAtUtc",
      "cancel_at_utc",
      "cancellationDate",
      "cancellation_date",
      "currentPeriodEnd",
      "periodEnd",
    ];

    let graceUntilIso: string | null = null;

    for (const key of graceKeys) {
      const candidate = parseOptionalDate((eventData as Record<string, unknown>)[key]);
      if (candidate) {
        const effective = candidate < canceledDate ? canceledDate : candidate;
        graceUntilIso = effective.toISOString();
        break;
      }
    }

    if (!graceUntilIso && subscription?.grace_until) {
      const graceDate = safeDate(subscription.grace_until);
      const effective = graceDate < canceledDate ? canceledDate : graceDate;
      graceUntilIso = effective.toISOString();
    } else if (!graceUntilIso && subscription?.current_period_end) {
      const periodEnd = safeDate(subscription.current_period_end);
      const effective = periodEnd < canceledDate ? canceledDate : periodEnd;
      graceUntilIso = effective.toISOString();
    }

    const rawRefundAmount = coerceNumber(
      (eventData.refundAmount as unknown) ??
        (eventData.cancelAmount as unknown) ??
        (eventData.canceledAmount as unknown) ??
        (eventData.cancellationAmount as unknown) ??
        (eventData.refundableAmount as unknown),
    );
    const refundAmount = rawRefundAmount !== null && rawRefundAmount > 0 ? rawRefundAmount : null;

    const refundCurrencyCandidates = [
      eventData.refundCurrency,
      eventData.currency,
      eventData.paymentCurrency,
    ];

    let refundCurrency: string | null = null;

    if (refundAmount) {
      for (const candidate of refundCurrencyCandidates) {
        const normalized = normalizeCurrency(candidate);
        if (normalized) {
          refundCurrency = normalized;
          break;
        }
      }
    }

    const refundNote =
      asTrimmedString(eventData.reason) ??
      asTrimmedString(eventData.cancelReason) ??
      asTrimmedString(eventData.cancellationReason);

    const cancellationMetadata: Record<string, unknown> = {
      lastWebhookEvent: eventType,
    };

    const lastCancellation: Record<string, unknown> = {
      at: canceledDate.toISOString(),
      source: eventType,
    };

    if (graceUntilIso) {
      lastCancellation.graceUntil = graceUntilIso;
    }

    if (refundAmount) {
      lastCancellation.refund = {
        amount: refundAmount,
        currency: refundCurrency ?? null,
        ...(refundNote ? { note: refundNote } : {}),
      };
    }

    cancellationMetadata.lastCancellation = lastCancellation;

    const eventDetails: Record<string, unknown> = {
      billingKey,
    };

    if (graceUntilIso) {
      eventDetails.graceUntil = graceUntilIso;
    }

    if (refundAmount) {
      eventDetails.refundAmount = refundAmount;
      if (refundCurrency) {
        eventDetails.refundCurrency = refundCurrency;
      }
      if (refundNote) {
        eventDetails.refundNote = refundNote;
      }
    }

    try {
      const subscriptionRecord = await upsertStoreSubscription(supabase, storeId, {
        status: "canceled",
        planId: subscription?.plan_id ?? null,
        billingProfileId: billingProfile.id,
        graceUntil: graceUntilIso,
        canceledAt,
        metadataPatch: cancellationMetadata,
        event: {
          type: `billing.webhook_${eventType.toLowerCase()}`,
          at: canceledDate.toISOString(),
          details: eventDetails,
        },
        eventSource: "api.billing.webhook",
      });

      const { error: revokeError } = await supabase
        .from("store_billing_profiles")
        .update({ status: "revoked" })
        .eq("id", billingProfile.id);

      if (revokeError) {
        console.error("Failed to revoke billing profile after cancellation", revokeError);
      }

      try {
        const invoiceDetails: Record<string, unknown> = {
          type: refundAmount ? "refund" : "cancellation",
          issuedAt: canceledDate.toISOString(),
          sourceEvent: eventType,
        };

        if (refundAmount !== null) {
          invoiceDetails.amount = refundAmount;
        }

        if (refundCurrency) {
          invoiceDetails.currency = refundCurrency;
        }

        if (graceUntilIso) {
          invoiceDetails.graceUntil = graceUntilIso;
        }

        if (refundNote) {
          invoiceDetails.note = refundNote;
        }

        await recordEvent(supabase, {
          type: refundAmount ? "billing.invoice_refunded" : "billing.invoice_canceled",
          at: canceledDate.toISOString(),
          details: invoiceDetails,
          context: {
            storeId,
            subscriptionId: subscriptionRecord.id,
            planId: subscriptionRecord.plan_id,
            billingProfileId: subscriptionRecord.billing_profile_id,
          },
          source: "api.billing.webhook",
        });
      } catch (invoiceError) {
        console.error("Failed to record cancellation invoice event from webhook", invoiceError);
      }

      return NextResponse.json({ status: "canceled" }, { status: 200 });
    } catch (error) {
      console.error("Failed to update store subscription for cancellation", error);
      return NextResponse.json(
        { error: "Unable to update store subscription" },
        { status: 500 },
      );
    }
  }

  console.info("Ignored Toss webhook event", { eventType });
  return NextResponse.json({ status: "ignored" }, { status: 200 });
}
