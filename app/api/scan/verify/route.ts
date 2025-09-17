import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { recordEvent } from "@/lib/event-service";
import { hashQrToken } from "@/lib/qr-token";
import { getSupabaseAdminClient } from "@/lib/supabase-client";
import {
  StoreFeatureAccessError,
  assertStoreFeatureAccess,
  fetchStoreByOwner,
  fetchStoreForCoupon,
  type StoreRecord,
} from "@/lib/store-service";

import { POST as redeemWalletToken } from "../wallet/[walletId]/redeem/route";

const ACCESS_TOKEN_COOKIE_NAME = "sb-access-token";

const RESULT_SOURCE = "api.scan.verify";

const SUCCESS_EVENT_TYPE = "wallet.scan.success";
const FAILURE_EVENT_TYPE = "wallet.scan.failed";

const RESULT_MESSAGES: Record<string, string> = {
  redeemed: "QR token redeemed successfully",
  expired: "QR token has expired",
  duplicate: "QR token already redeemed",
  mismatched_store: "QR token belongs to a different store",
  not_found: "QR token not found",
  invalid: "QR token is not redeemable",
};

type SupabaseAdminClient = ReturnType<typeof getSupabaseAdminClient>;

function extractAccessToken(request: Request) {
  const authHeader = request.headers.get("authorization") ?? request.headers.get("Authorization");

  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length).trim();
    if (token) {
      return token;
    }
  }

  const cookieStore = cookies();
  const cookieToken = cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value;
  return cookieToken ?? null;
}

type AuthenticatedMerchant = {
  merchantId: string;
  store: StoreRecord;
};

type QrTokenRow = {
  id: string;
  user_id: string;
  wallet_id: string | null;
  coupon_id: string | null;
  expires_at: string | null;
  redeemed_at: string | null;
  is_single_use: boolean;
  metadata: Record<string, unknown> | null;
};

type CouponRow = {
  id: string;
  code: string | null;
  store_id: string | null;
  merchant_id: string | null;
};

type ScanVerifyRequestBody = {
  token?: string;
};

type ScanResult =
  | {
      result: "redeemed";
      message: string;
      redeemedAt: string;
      redemptionId: string | null;
      coupon: { id: string; code: string | null } | null;
      wallet: { id: string; status: string; metadata: Record<string, unknown> | null } | null;
      storeId: string | null;
    }
  | {
      result: "expired" | "duplicate" | "mismatched_store" | "not_found" | "invalid";
      message: string;
      error: string;
      coupon?: { id: string; code: string | null } | null;
      walletId?: string | null;
      redeemedAt?: string | null;
      expiresAt?: string | null;
      storeId?: string | null;
      expectedStoreId?: string | null;
    };

async function authenticateMerchant(
  request: Request,
  supabase = getSupabaseAdminClient(),
): Promise<AuthenticatedMerchant | { error: NextResponse }> {
  const accessToken = extractAccessToken(request);

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
      error: NextResponse.json({ error: "Only merchants can scan and redeem" }, { status: 403 }),
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

async function loadQrToken(
  supabase: SupabaseAdminClient,
  hashedToken: string,
): Promise<{ token: QrTokenRow | null; error: NextResponse | null }> {
  const { data, error } = await supabase
    .from("qr_tokens")
    .select(
      "id, user_id, wallet_id, coupon_id, expires_at, redeemed_at, is_single_use, metadata",
    )
    .eq("token", hashedToken)
    .maybeSingle();

  if (error) {
    console.error("Failed to load QR token", error);
    return {
      token: null,
      error: NextResponse.json({ error: "Unable to verify QR token" }, { status: 500 }),
    };
  }

  return { token: data as QrTokenRow | null, error: null };
}

async function loadCoupon(
  supabase: SupabaseAdminClient,
  couponId: string,
): Promise<{ coupon: CouponRow | null; error: NextResponse | null }> {
  const { data, error } = await supabase
    .from("coupons")
    .select("id, code, store_id, merchant_id")
    .eq("id", couponId)
    .maybeSingle();

  if (error) {
    console.error("Failed to load coupon for scan verification", error);
    return {
      coupon: null,
      error: NextResponse.json({ error: "Unable to verify coupon" }, { status: 500 }),
    };
  }

  if (!data) {
    return {
      coupon: null,
      error: NextResponse.json({ error: "Coupon not found", result: "invalid" }, { status: 404 }),
    };
  }

  return { coupon: data as CouponRow, error: null };
}

async function recordScan(
  supabase: SupabaseAdminClient,
  {
    type,
    message,
    merchantId,
    storeId,
    walletId,
    qrTokenId,
    couponId,
    result,
    details,
    userId,
    redemptionId,
    occurredAt,
  }: {
    type: typeof SUCCESS_EVENT_TYPE | typeof FAILURE_EVENT_TYPE;
    message: string;
    merchantId: string;
    storeId: string | null;
    walletId: string | null;
    qrTokenId: string | null;
    couponId: string | null;
    result: string;
    details?: Record<string, unknown>;
    userId?: string | null;
    redemptionId?: string | null;
    occurredAt: string;
  },
) {
  try {
    await recordEvent(supabase, {
      type,
      at: occurredAt,
      message,
      source: RESULT_SOURCE,
      context: {
        actorId: merchantId,
        storeId,
        walletId,
        couponId,
        qrTokenId,
        redemptionId: redemptionId ?? null,
        userId: userId ?? null,
        result,
      },
      details: {
        ...(details ?? {}),
      },
    });
  } catch (error) {
    console.error("Failed to record scan event", error);
  }
}

function buildErrorPayload(
  result: ScanResult["result"],
  message: string,
  additions: Omit<
    Extract<
      ScanResult,
      { result: "expired" | "duplicate" | "mismatched_store" | "not_found" | "invalid" }
    >,
    "result" | "message" | "error"
  > = {},
) {
  return {
    result,
    message,
    error: message,
    ...additions,
  } satisfies Extract<
    ScanResult,
    { result: "expired" | "duplicate" | "mismatched_store" | "not_found" | "invalid" }
  >;
}

function buildSuccessPayload(
  payload: Extract<ScanResult, { result: "redeemed" }> & { coupon?: { id: string; code: string | null } | null },
) {
  return {
    result: payload.result,
    message: payload.message,
    redeemedAt: payload.redeemedAt,
    redemptionId: payload.redemptionId,
    coupon: payload.coupon ?? null,
    wallet: payload.wallet,
    storeId: payload.storeId,
  } satisfies Extract<ScanResult, { result: "redeemed" }>;
}

export async function POST(request: Request) {
  let body: ScanVerifyRequestBody;

  try {
    body = await request.json();
  } catch (error) {
    console.error("Failed to parse scan verify payload", error);
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const tokenValue = body?.token;

  if (!tokenValue || typeof tokenValue !== "string" || !tokenValue.trim()) {
    return NextResponse.json(
      buildErrorPayload("invalid", "QR token is required"),
      { status: 400 },
    );
  }

  const token = tokenValue.trim();
  const supabase = getSupabaseAdminClient();

  const authResult = await authenticateMerchant(request, supabase);

  if ("error" in authResult) {
    return authResult.error;
  }

  const { merchantId, store: merchantStore } = authResult;

  try {
    assertStoreFeatureAccess(merchantStore.subscription_status, "wallet.scan", merchantStore.name);
  } catch (error) {
    if (error instanceof StoreFeatureAccessError) {
      return NextResponse.json(
        {
          ...buildErrorPayload("invalid", error.message),
          subscriptionStatus: error.status,
        },
        { status: 402 },
      );
    }

    console.error("Unexpected store subscription error", error);
    return NextResponse.json({ error: "Unable to authorize scan" }, { status: 500 });
  }

  const hashedToken = hashQrToken(token);

  const { token: qrToken, error: tokenError } = await loadQrToken(supabase, hashedToken);

  if (tokenError) {
    return tokenError;
  }

  const now = new Date();
  const nowIso = now.toISOString();

  if (!qrToken) {
    await recordScan(supabase, {
      type: FAILURE_EVENT_TYPE,
      message: RESULT_MESSAGES.not_found,
      merchantId,
      storeId: merchantStore.id,
      walletId: null,
      qrTokenId: null,
      couponId: null,
      result: "not_found",
      details: { tokenHash: hashedToken },
      occurredAt: nowIso,
    });

    return NextResponse.json(
      buildErrorPayload("not_found", "QR token not found"),
      { status: 404 },
    );
  }

  if (!qrToken.wallet_id) {
    await recordScan(supabase, {
      type: FAILURE_EVENT_TYPE,
      message: RESULT_MESSAGES.invalid,
      merchantId,
      storeId: merchantStore.id,
      walletId: null,
      qrTokenId: qrToken.id,
      couponId: qrToken.coupon_id ?? null,
      result: "invalid",
      details: { reason: "missing_wallet_reference" },
      userId: qrToken.user_id,
      occurredAt: nowIso,
    });

    return NextResponse.json(
      buildErrorPayload("invalid", "QR token is not linked to a wallet", {
        coupon: qrToken.coupon_id ? { id: qrToken.coupon_id, code: null } : undefined,
        walletId: null,
      }),
      { status: 409 },
    );
  }

  if (!qrToken.is_single_use) {
    await recordScan(supabase, {
      type: FAILURE_EVENT_TYPE,
      message: RESULT_MESSAGES.invalid,
      merchantId,
      storeId: merchantStore.id,
      walletId: qrToken.wallet_id,
      qrTokenId: qrToken.id,
      couponId: qrToken.coupon_id ?? null,
      result: "invalid",
      details: { reason: "token_not_single_use" },
      userId: qrToken.user_id,
      occurredAt: nowIso,
    });

    return NextResponse.json(
      buildErrorPayload("invalid", "QR token is not redeemable", {
        coupon: qrToken.coupon_id ? { id: qrToken.coupon_id, code: null } : undefined,
        walletId: qrToken.wallet_id,
      }),
      { status: 409 },
    );
  }

  let coupon: CouponRow | null = null;
  let couponStore: StoreRecord | null = null;

  if (qrToken.coupon_id) {
    const { coupon: couponRow, error: couponError } = await loadCoupon(supabase, qrToken.coupon_id);

    if (couponError) {
      return couponError;
    }

    coupon = couponRow;

    try {
      couponStore = await fetchStoreForCoupon(
        supabase,
        couponRow.id,
        couponRow.merchant_id,
      );
    } catch (error) {
      console.error("Failed to load store for coupon", error);
      return NextResponse.json({ error: "Unable to verify coupon store" }, { status: 500 });
    }

    if (!couponStore) {
      await recordScan(supabase, {
        type: FAILURE_EVENT_TYPE,
        message: RESULT_MESSAGES.invalid,
        merchantId,
        storeId: merchantStore.id,
        walletId: qrToken.wallet_id,
        qrTokenId: qrToken.id,
        couponId: couponRow.id,
        result: "invalid",
        details: { reason: "store_not_found_for_coupon" },
        userId: qrToken.user_id,
        occurredAt: nowIso,
      });

      return NextResponse.json(
        buildErrorPayload("invalid", "Store not found for coupon", {
          coupon: { id: couponRow.id, code: couponRow.code },
          walletId: qrToken.wallet_id,
        }),
        { status: 404 },
      );
    }

    if (couponStore.owner_id !== merchantId) {
      await recordScan(supabase, {
        type: FAILURE_EVENT_TYPE,
        message: RESULT_MESSAGES.mismatched_store,
        merchantId,
        storeId: merchantStore.id,
        walletId: qrToken.wallet_id,
        qrTokenId: qrToken.id,
        couponId: couponRow.id,
        result: "mismatched_store",
        details: {
          couponStoreId: couponStore.id,
        },
        userId: qrToken.user_id,
        occurredAt: nowIso,
      });

      return NextResponse.json(
        buildErrorPayload("mismatched_store", "QR token belongs to a different store", {
          coupon: { id: couponRow.id, code: couponRow.code },
          walletId: qrToken.wallet_id,
          storeId: couponStore.id,
          expectedStoreId: merchantStore.id,
        }),
        { status: 403 },
      );
    }
  }

  if (qrToken.redeemed_at) {
    await recordScan(supabase, {
      type: FAILURE_EVENT_TYPE,
      message: RESULT_MESSAGES.duplicate,
      merchantId,
      storeId: merchantStore.id,
      walletId: qrToken.wallet_id,
      qrTokenId: qrToken.id,
      couponId: qrToken.coupon_id ?? null,
      result: "duplicate",
      details: { redeemedAt: qrToken.redeemed_at },
      userId: qrToken.user_id,
      occurredAt: nowIso,
    });

    return NextResponse.json(
      buildErrorPayload("duplicate", "QR token already redeemed", {
        coupon: coupon ? { id: coupon.id, code: coupon.code } : undefined,
        walletId: qrToken.wallet_id,
        redeemedAt: qrToken.redeemed_at,
        storeId: couponStore?.id ?? merchantStore.id,
      }),
      { status: 409 },
    );
  }

  if (qrToken.expires_at && new Date(qrToken.expires_at) <= now) {
    await recordScan(supabase, {
      type: FAILURE_EVENT_TYPE,
      message: RESULT_MESSAGES.expired,
      merchantId,
      storeId: merchantStore.id,
      walletId: qrToken.wallet_id,
      qrTokenId: qrToken.id,
      couponId: qrToken.coupon_id ?? null,
      result: "expired",
      details: { expiresAt: qrToken.expires_at },
      userId: qrToken.user_id,
      occurredAt: nowIso,
    });

    return NextResponse.json(
      buildErrorPayload("expired", "QR token has expired", {
        coupon: coupon ? { id: coupon.id, code: coupon.code } : undefined,
        walletId: qrToken.wallet_id,
        expiresAt: qrToken.expires_at,
        storeId: couponStore?.id ?? merchantStore.id,
      }),
      { status: 410 },
    );
  }

  const redeemRequest = new Request("http://localhost/internal/wallet/redeem", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });

  const redeemResponse = await redeemWalletToken(redeemRequest, {
    params: { walletId: qrToken.wallet_id },
  });

  let redeemPayload: unknown = null;

  try {
    redeemPayload = await redeemResponse.json();
  } catch {
    redeemPayload = null;
  }

  const payloadRecord =
    redeemPayload && typeof redeemPayload === "object"
      ? (redeemPayload as Record<string, unknown>)
      : null;

  if (!redeemResponse.ok) {
    const message =
      payloadRecord && typeof payloadRecord.error === "string" && payloadRecord.error.trim()
        ? payloadRecord.error
        : "Unable to redeem QR token";

    await recordScan(supabase, {
      type: FAILURE_EVENT_TYPE,
      message,
      merchantId,
      storeId: merchantStore.id,
      walletId: qrToken.wallet_id,
      qrTokenId: qrToken.id,
      couponId: qrToken.coupon_id ?? null,
      result: "invalid",
      details: {
        upstreamStatus: redeemResponse.status,
      },
      userId: qrToken.user_id,
      occurredAt: nowIso,
    });

    if (payloadRecord) {
      return NextResponse.json(
        {
          result: "invalid",
          message,
          error: message,
          coupon: coupon ? { id: coupon.id, code: coupon.code } : undefined,
          walletId: qrToken.wallet_id,
          storeId: couponStore?.id ?? merchantStore.id,
          ...payloadRecord,
        },
        { status: redeemResponse.status },
      );
    }

    return NextResponse.json(
      buildErrorPayload("invalid", message, {
        coupon: coupon ? { id: coupon.id, code: coupon.code } : undefined,
        walletId: qrToken.wallet_id,
        storeId: couponStore?.id ?? merchantStore.id,
      }),
      { status: redeemResponse.status },
    );
  }

  const payloadRedeemedAt =
    payloadRecord && typeof payloadRecord.redeemedAt === "string"
      ? payloadRecord.redeemedAt
      : null;

  const payloadRedemptionId =
    payloadRecord && typeof payloadRecord.redemptionId === "string"
      ? payloadRecord.redemptionId
      : null;

  const payloadCoupon = (() => {
    if (!payloadRecord) {
      return null;
    }

    const raw = payloadRecord.coupon;

    if (!raw || typeof raw !== "object") {
      return null;
    }

    const couponRecord = raw as Record<string, unknown>;
    const couponId = typeof couponRecord.id === "string" ? couponRecord.id : null;

    if (!couponId) {
      return null;
    }

    const couponCode =
      "code" in couponRecord && typeof couponRecord.code === "string"
        ? couponRecord.code
        : null;

    return { id: couponId, code: couponCode };
  })();

  const payloadWallet = (() => {
    if (!payloadRecord) {
      return null;
    }

    const raw = payloadRecord.wallet;

    if (!raw || typeof raw !== "object") {
      return null;
    }

    const walletRecord = raw as Record<string, unknown>;
    const walletId = typeof walletRecord.id === "string" ? walletRecord.id : null;
    const walletStatus = typeof walletRecord.status === "string" ? walletRecord.status : null;

    if (!walletId || !walletStatus) {
      return null;
    }

    const walletMetadata =
      "metadata" in walletRecord && walletRecord.metadata && typeof walletRecord.metadata === "object"
        ? (walletRecord.metadata as Record<string, unknown>)
        : null;

    return { id: walletId, status: walletStatus, metadata: walletMetadata ?? null };
  })();

  const successPayload = buildSuccessPayload({
    result: "redeemed",
    message: coupon
      ? `Redeemed coupon ${coupon.code ?? ""}`.trim()
      : RESULT_MESSAGES.redeemed,
    redeemedAt: payloadRedeemedAt ?? nowIso,
    redemptionId: payloadRedemptionId,
    coupon:
      payloadCoupon ?? (coupon ? { id: coupon.id, code: coupon.code } : null),
    wallet: payloadWallet,
    storeId: couponStore?.id ?? merchantStore.id,
  });

  await recordScan(supabase, {
    type: SUCCESS_EVENT_TYPE,
    message: successPayload.message,
    merchantId,
    storeId: successPayload.storeId,
    walletId: successPayload.wallet?.id ?? qrToken.wallet_id,
    qrTokenId: qrToken.id,
    couponId: successPayload.coupon?.id ?? qrToken.coupon_id ?? null,
    result: successPayload.result,
    details: {
      redemptionId: successPayload.redemptionId,
    },
    userId: qrToken.user_id,
    redemptionId: successPayload.redemptionId ?? undefined,
    occurredAt: successPayload.redeemedAt,
  });

  return NextResponse.json(successPayload);
}
