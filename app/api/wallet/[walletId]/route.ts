import { NextResponse } from "next/server";

import {
  authorizationErrorResponse,
  isAuthorizationError,
  requireAuthenticatedUser,
} from "@/lib/server-auth";
import {
  extractCouponState,
  fetchWallet,
  type WalletCouponStateRecord,
  type WalletStatus,
} from "@/lib/wallet-service";

type CouponRedemptionRow = {
  id: string;
  coupon_id: string;
  redeemed_at: string | null;
};

type CouponRecord = {
  id: string;
  code: string | null;
  name: string | null;
  description: string | null;
};

type ActiveQrTokenRow = {
  id: string;
  coupon_id: string | null;
  expires_at: string | null;
  metadata: Record<string, unknown> | null;
};

type WalletCouponEntryResponse = {
  couponId: string;
  couponCode: string | null;
  couponName: string | null;
  couponDescription: string | null;
  status: WalletStatus;
  claimedAt: string | null;
  redeemedAt: string | null;
  lastUpdatedAt: string | null;
  redemptionId: string | null;
  qrTokenId: string | null;
  qrTokenExpiresAt: string | null;
};

type ActiveQrTokenResponse = {
  id: string;
  couponId: string | null;
  couponCode: string | null;
  expiresAt: string;
  metadata: Record<string, unknown> | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function coerceIsoTimestamp(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function resolveStatus(state: WalletCouponStateRecord, fallback: WalletStatus): WalletStatus {
  return state.status ?? fallback;
}

function extractCouponCodeFromMetadata(metadata: unknown) {
  if (!isRecord(metadata)) {
    return null;
  }

  const value = metadata.couponCode;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  return null;
}

function sortEntries(entries: WalletCouponEntryResponse[]) {
  return [...entries].sort((a, b) => {
    const toComparable = (entry: WalletCouponEntryResponse) => {
      const source = entry.lastUpdatedAt ?? entry.redeemedAt ?? entry.claimedAt;
      return source ? new Date(source).getTime() : 0;
    };

    return toComparable(b) - toComparable(a);
  });
}

export async function GET(
  _request: Request,
  { params }: { params: { walletId: string } },
) {
  const walletId = params.walletId;

  if (!walletId) {
    return NextResponse.json({ error: "walletId is required" }, { status: 400 });
  }

  let auth;

  try {
    auth = await requireAuthenticatedUser({ requiredRole: "customer" });
  } catch (error) {
    if (isAuthorizationError(error)) {
      return authorizationErrorResponse(error);
    }

    throw error;
  }

  const { supabase, user } = auth;
  const userId = user.id;

  let wallet;

  try {
    wallet = await fetchWallet(supabase, walletId);
  } catch (error) {
    console.error("Failed to load wallet", error);
    return NextResponse.json({ error: "Unable to load wallet" }, { status: 500 });
  }

  if (!wallet) {
    return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
  }

  if (wallet.user_id !== userId) {
    return NextResponse.json({ error: "Wallet does not belong to user" }, { status: 403 });
  }

  const couponState = extractCouponState(wallet.metadata);
  const entriesByCouponId = new Map<string, WalletCouponEntryResponse>();
  const couponIds = new Set<string>();

  if (couponState.couponId) {
    couponIds.add(couponState.couponId);
    entriesByCouponId.set(couponState.couponId, {
      couponId: couponState.couponId,
      couponCode: couponState.couponCode,
      couponName: null,
      couponDescription: null,
      status: resolveStatus(couponState, "claimed"),
      claimedAt: couponState.claimedAt,
      redeemedAt: couponState.redeemedAt,
      lastUpdatedAt:
        couponState.lastUpdatedAt ??
        couponState.redeemedAt ??
        couponState.claimedAt ??
        null,
      redemptionId: null,
      qrTokenId: couponState.qrTokenId,
      qrTokenExpiresAt: couponState.qrTokenExpiresAt,
    });
  }

  const { data: redemptions, error: redemptionError } = await supabase
    .from("coupon_redemptions")
    .select("id, coupon_id, redeemed_at")
    .eq("wallet_id", walletId)
    .order("redeemed_at", { ascending: false });

  if (redemptionError) {
    console.error("Failed to load wallet coupon redemptions", redemptionError);
    return NextResponse.json({ error: "Unable to load coupon history" }, { status: 500 });
  }

  if (Array.isArray(redemptions)) {
    for (const redemption of redemptions as CouponRedemptionRow[]) {
      if (!redemption.coupon_id) {
        continue;
      }

      couponIds.add(redemption.coupon_id);

      const existing = entriesByCouponId.get(redemption.coupon_id);
      const redeemedAt = coerceIsoTimestamp(redemption.redeemed_at);

      if (existing) {
        existing.status = "used";
        existing.redeemedAt = redeemedAt;
        existing.lastUpdatedAt = existing.lastUpdatedAt ?? redeemedAt;
        existing.redemptionId = existing.redemptionId ?? redemption.id;
        continue;
      }

      entriesByCouponId.set(redemption.coupon_id, {
        couponId: redemption.coupon_id,
        couponCode: null,
        couponName: null,
        couponDescription: null,
        status: "used",
        claimedAt: null,
        redeemedAt,
        lastUpdatedAt: redeemedAt,
        redemptionId: redemption.id,
        qrTokenId: null,
        qrTokenExpiresAt: null,
      });
    }
  }

  const nowIso = new Date().toISOString();

  const { data: activeTokens, error: activeTokenError } = await supabase
    .from("qr_tokens")
    .select("id, coupon_id, expires_at, metadata")
    .eq("wallet_id", walletId)
    .is("redeemed_at", null)
    .gt("expires_at", nowIso)
    .order("expires_at", { ascending: true })
    .limit(1);

  if (activeTokenError) {
    console.error("Failed to load active QR tokens", activeTokenError);
    return NextResponse.json({ error: "Unable to load QR tokens" }, { status: 500 });
  }

  let activeQrToken: ActiveQrTokenResponse | null = null;

  if (Array.isArray(activeTokens) && activeTokens.length > 0) {
    const token = activeTokens[0] as ActiveQrTokenRow;
    const expiresAt = coerceIsoTimestamp(token.expires_at);

    if (expiresAt) {
      const metadata = isRecord(token.metadata) ? { ...token.metadata } : null;
      const couponCode = extractCouponCodeFromMetadata(metadata ?? undefined);
      const couponId = token.coupon_id ?? null;

      if (couponId) {
        couponIds.add(couponId);
        const existing = entriesByCouponId.get(couponId);

        if (existing) {
          existing.qrTokenId = existing.qrTokenId ?? token.id;
          existing.qrTokenExpiresAt = existing.qrTokenExpiresAt ?? expiresAt;
          existing.lastUpdatedAt = existing.lastUpdatedAt ?? expiresAt;
        } else {
          entriesByCouponId.set(couponId, {
            couponId,
            couponCode: couponCode ?? null,
            couponName: null,
            couponDescription: null,
            status: "claimed",
            claimedAt: null,
            redeemedAt: null,
            lastUpdatedAt: expiresAt,
            redemptionId: null,
            qrTokenId: token.id,
            qrTokenExpiresAt: expiresAt,
          });
        }
      }

      activeQrToken = {
        id: token.id,
        couponId,
        couponCode: couponCode ?? null,
        expiresAt,
        metadata,
      } satisfies ActiveQrTokenResponse;
    }
  }

  if (couponIds.size > 0) {
    const { data: coupons, error: couponError } = await supabase
      .from("coupons")
      .select("id, code, name, description")
      .in("id", Array.from(couponIds));

    if (couponError) {
      console.error("Failed to load coupons for wallet", couponError);
      return NextResponse.json({ error: "Unable to load coupons" }, { status: 500 });
    }

    if (Array.isArray(coupons)) {
      for (const coupon of coupons as CouponRecord[]) {
        const entry = entriesByCouponId.get(coupon.id);
        if (!entry) {
          continue;
        }

        entry.couponCode = entry.couponCode ?? coupon.code;
        entry.couponName = coupon.name ?? entry.couponName;
        entry.couponDescription = coupon.description ?? entry.couponDescription;
      }
    }
  }

  const entries = sortEntries(Array.from(entriesByCouponId.values()));

  return NextResponse.json({
    wallet: {
      id: wallet.id,
      status: wallet.status,
    },
    entries,
    activeQrToken,
  });
}

