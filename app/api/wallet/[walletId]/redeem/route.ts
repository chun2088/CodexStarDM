import { NextResponse } from "next/server";

import { getSupabaseAdminClient } from "@/lib/supabase-client";
import { hashQrToken } from "@/lib/qr-token";
import { ensureCouponState, transitionWallet } from "@/lib/wallet-service";

type RedeemRequestBody = {
  token?: string;
};

function extractCouponCodeFromMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const candidate = (metadata as Record<string, unknown>).couponCode;
  return typeof candidate === "string" ? candidate : null;
}

export async function POST(
  request: Request,
  { params }: { params: { walletId: string } },
) {
  const walletId = params.walletId;

  if (!walletId) {
    return NextResponse.json(
      { error: "walletId is required" },
      { status: 400 },
    );
  }

  let body: RedeemRequestBody;

  try {
    body = await request.json();
  } catch (error) {
    console.error("Failed to parse redeem payload", error);
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const token = body?.token;

  if (!token || typeof token !== "string") {
    return NextResponse.json(
      { error: "token is required" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdminClient();

  const { data: wallet, error: walletError } = await supabase
    .from("wallets")
    .select("id, user_id, status, metadata")
    .eq("id", walletId)
    .maybeSingle();

  if (walletError) {
    console.error("Failed to load wallet", walletError);
    return NextResponse.json(
      { error: "Unable to load wallet" },
      { status: 500 },
    );
  }

  if (!wallet) {
    return NextResponse.json(
      { error: "Wallet not found" },
      { status: 404 },
    );
  }

  const hashedToken = hashQrToken(token);

  const { data: qrToken, error: qrError } = await supabase
    .from("qr_tokens")
    .select(
      "id, user_id, wallet_id, coupon_id, expires_at, redeemed_at, is_single_use, metadata",
    )
    .eq("token", hashedToken)
    .eq("wallet_id", walletId)
    .maybeSingle();

  if (qrError) {
    console.error("Failed to load QR token", qrError);
    return NextResponse.json(
      { error: "Unable to redeem token" },
      { status: 500 },
    );
  }

  if (!qrToken) {
    return NextResponse.json(
      { error: "QR token not found" },
      { status: 404 },
    );
  }

  if (qrToken.wallet_id !== walletId) {
    return NextResponse.json(
      { error: "QR token does not belong to this wallet" },
      { status: 403 },
    );
  }

  if (qrToken.user_id !== wallet.user_id) {
    return NextResponse.json(
      { error: "QR token owner mismatch" },
      { status: 403 },
    );
  }

  if (!qrToken.is_single_use) {
    return NextResponse.json(
      { error: "QR token is not redeemable" },
      { status: 409 },
    );
  }

  if (qrToken.redeemed_at) {
    return NextResponse.json(
      { error: "QR token already redeemed" },
      { status: 409 },
    );
  }

  const now = new Date();
  const nowIso = now.toISOString();

  if (qrToken.expires_at && new Date(qrToken.expires_at) <= now) {
    await transitionWallet({
      client: supabase,
      wallet,
      walletId,
      nextStatus: "expired",
      event: {
        type: "coupon.expired",
        message: "QR token expired before redemption",
        at: nowIso,
        details: {
          qrTokenId: qrToken.id,
          expiresAt: qrToken.expires_at,
        },
      },
      mutateMetadata: (metadata) => {
        const nextMetadata = { ...metadata };
        const { couponState } = ensureCouponState(nextMetadata);

        if (qrToken.coupon_id) {
          couponState.couponId = qrToken.coupon_id;
        }

        const couponCode = extractCouponCodeFromMetadata(qrToken.metadata);

        if (couponCode) {
          couponState.couponCode = couponCode;
        }

        couponState.status = "expired";
        couponState.lastUpdatedAt = nowIso;
        couponState.qrTokenId = qrToken.id;
        couponState.qrTokenExpiresAt = qrToken.expires_at;

        nextMetadata.couponState = couponState;
        return nextMetadata;
      },
    });

    return NextResponse.json(
      { error: "QR token has expired" },
      { status: 410 },
    );
  }

  let coupon:
    | {
        id: string;
        code: string;
        redeemed_count: number;
        max_redemptions: number | null;
        is_active: boolean;
        end_at: string | null;
      }
    | null = null;

  if (qrToken.coupon_id) {
    const { data, error } = await supabase
      .from("coupons")
      .select("id, code, redeemed_count, max_redemptions, is_active, end_at")
      .eq("id", qrToken.coupon_id)
      .maybeSingle();

    if (error) {
      console.error("Failed to load coupon for redemption", error);
      return NextResponse.json(
        { error: "Unable to redeem coupon" },
        { status: 500 },
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "Coupon not found" },
        { status: 404 },
      );
    }

    coupon = data;

    if (!coupon.is_active) {
      return NextResponse.json(
        { error: "Coupon is no longer active" },
        { status: 409 },
      );
    }

    if (coupon.end_at && new Date(coupon.end_at) < now) {
      return NextResponse.json(
        { error: "Coupon has expired" },
        { status: 409 },
      );
    }

    if (
      coupon.max_redemptions !== null &&
      coupon.redeemed_count >= coupon.max_redemptions
    ) {
      return NextResponse.json(
        { error: "Coupon redemption limit reached" },
        { status: 409 },
      );
    }
  }

  const { data: redeemedToken, error: redeemError } = await supabase
    .from("qr_tokens")
    .update({ redeemed_at: nowIso })
    .eq("id", qrToken.id)
    .eq("wallet_id", walletId)
    .eq("is_single_use", true)
    .is("redeemed_at", null)
    .gt("expires_at", nowIso)
    .select("id, coupon_id")
    .maybeSingle();

  if (redeemError) {
    console.error("Failed to redeem QR token", redeemError);
    return NextResponse.json(
      { error: "Unable to redeem QR token" },
      { status: 500 },
    );
  }

  if (!redeemedToken) {
    return NextResponse.json(
      { error: "QR token redemption conflict" },
      { status: 409 },
    );
  }

  let redemptionRecord: { id: string } | null = null;

  if (qrToken.coupon_id) {
    const { data, error } = await supabase
      .from("coupon_redemptions")
      .insert({
        coupon_id: qrToken.coupon_id,
        user_id: qrToken.user_id,
        wallet_id: qrToken.wallet_id,
        qr_token_id: qrToken.id,
        redeemed_at: nowIso,
        metadata: {
          source: "wallet.redeem",
        },
      })
      .select("id")
      .single();

    if (error) {
      console.error("Failed to record coupon redemption", error);
      return NextResponse.json(
        { error: "Unable to record redemption" },
        { status: 500 },
      );
    }

    redemptionRecord = data;
  }

  if (coupon) {
    const { error, data } = await supabase
      .from("coupons")
      .update({ redeemed_count: coupon.redeemed_count + 1 })
      .eq("id", coupon.id)
      .eq("redeemed_count", coupon.redeemed_count)
      .select("id, redeemed_count")
      .maybeSingle();

    if (error) {
      console.error("Failed to increment coupon redemption count", error);
    } else if (!data) {
      console.warn("Coupon redemption count update skipped due to concurrent update", {
        couponId: coupon.id,
      });
    }
  }

  const updatedWallet = await transitionWallet({
    client: supabase,
    wallet,
    walletId,
    nextStatus: "used",
    event: {
      type: "coupon.redeemed",
      message: coupon
        ? `Coupon ${coupon.code} redeemed`
        : "Wallet QR token redeemed",
      at: nowIso,
      details: {
        couponId: coupon?.id ?? null,
        qrTokenId: qrToken.id,
        redemptionId: redemptionRecord?.id ?? null,
      },
    },
    mutateMetadata: (metadata) => {
      const nextMetadata = { ...metadata };
      const { couponState } = ensureCouponState(nextMetadata);

      if (coupon) {
        couponState.couponId = coupon.id;
        couponState.couponCode = coupon.code;
      } else if (qrToken.coupon_id) {
        couponState.couponId = qrToken.coupon_id;
        const couponCode = extractCouponCodeFromMetadata(qrToken.metadata);

        if (couponCode) {
          couponState.couponCode = couponCode;
        }
      }

      couponState.status = "used";
      couponState.redeemedAt = nowIso;
      couponState.lastUpdatedAt = nowIso;
      couponState.qrTokenId = qrToken.id;
      couponState.qrTokenExpiresAt = null;

      nextMetadata.couponState = couponState;
      return nextMetadata;
    },
  });

  return NextResponse.json({
    redeemedAt: nowIso,
    coupon: coupon
      ? {
          id: coupon.id,
          code: coupon.code,
        }
      : null,
    redemptionId: redemptionRecord?.id ?? null,
    wallet: {
      id: updatedWallet.id,
      status: updatedWallet.status,
      metadata: updatedWallet.metadata,
    },
  });
}
