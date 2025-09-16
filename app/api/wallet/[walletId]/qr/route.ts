import { NextResponse } from "next/server";

import { getSupabaseAdminClient } from "@/lib/supabase-client";
import { QR_TOKEN_TTL_SECONDS, generateQrTokenValue, hashQrToken } from "@/lib/qr-token";
import {
  StoreFeatureAccessError,
  assertStoreFeatureAccess,
  fetchStoreForCoupon,
} from "@/lib/store-service";
import { ensureCouponState, transitionWallet } from "@/lib/wallet-service";

type GenerateQrRequestBody = {
  userId?: string;
  couponId?: string | null;
};

function extractCouponIdFromMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const couponState = (metadata as Record<string, unknown>).couponState;

  if (!couponState || typeof couponState !== "object") {
    return null;
  }

  const candidate = (couponState as Record<string, unknown>).couponId;
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

  let body: GenerateQrRequestBody;

  try {
    body = await request.json();
  } catch (error) {
    console.error("Failed to parse wallet QR payload", error);
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const { userId, couponId: providedCouponId } = body ?? {};

  if (!userId) {
    return NextResponse.json(
      { error: "userId is required" },
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

  if (wallet.user_id !== userId) {
    return NextResponse.json(
      { error: "Wallet does not belong to user" },
      { status: 403 },
    );
  }

  const targetCouponId =
    (typeof providedCouponId === "string" && providedCouponId) ||
    extractCouponIdFromMetadata(wallet.metadata) ||
    null;

  if (!targetCouponId) {
    return NextResponse.json(
      { error: "Coupon id is required to generate a QR token" },
      { status: 400 },
    );
  }

  const { data: coupon, error: couponError } = await supabase
    .from("coupons")
    .select(
      "id, code, name, discount_type, discount_value, max_redemptions, redeemed_count, start_at, end_at, is_active, store_id, merchant_id",
    )
    .eq("id", targetCouponId)
    .maybeSingle();

  if (couponError) {
    console.error("Failed to load coupon", couponError);
    return NextResponse.json(
      { error: "Unable to prepare QR token" },
      { status: 500 },
    );
  }

  if (!coupon) {
    return NextResponse.json(
      { error: "Coupon not found" },
      { status: 404 },
    );
  }

  const now = new Date();

  if (!coupon.is_active) {
    return NextResponse.json(
      { error: "Coupon is not active" },
      { status: 409 },
    );
  }

  if (coupon.start_at && new Date(coupon.start_at) > now) {
    return NextResponse.json(
      { error: "Coupon is not yet available" },
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

  let store;

  try {
    store = await fetchStoreForCoupon(supabase, coupon.id, coupon.merchant_id);
  } catch (error) {
    console.error("Failed to load store for QR generation", error);
    return NextResponse.json(
      { error: "Unable to validate store subscription" },
      { status: 500 },
    );
  }

  if (!store) {
    return NextResponse.json(
      { error: "Store not found for coupon" },
      { status: 404 },
    );
  }

  try {
    assertStoreFeatureAccess(store.subscription_status, "wallet.qr", store.name);
  } catch (error) {
    if (error instanceof StoreFeatureAccessError) {
      return NextResponse.json(
        { error: error.message, subscriptionStatus: error.status },
        { status: 402 },
      );
    }

    console.error("Unexpected store access failure", error);
    return NextResponse.json(
      { error: "Unable to authorize QR token" },
      { status: 500 },
    );
  }

  const nowIso = now.toISOString();

  const { error: invalidateError } = await supabase
    .from("qr_tokens")
    .update({ expires_at: nowIso })
    .eq("wallet_id", walletId)
    .is("redeemed_at", null)
    .gt("expires_at", nowIso);

  if (invalidateError) {
    console.error("Failed to expire prior QR tokens", invalidateError);
  }

  const expiresAt = new Date(now.getTime() + QR_TOKEN_TTL_SECONDS * 1000);
  const expiresAtIso = expiresAt.toISOString();
  const rawToken = generateQrTokenValue();
  const hashedToken = hashQrToken(rawToken);

  const { data: insertedToken, error: insertError } = await supabase
    .from("qr_tokens")
    .insert({
      user_id: wallet.user_id,
      wallet_id: walletId,
      coupon_id: coupon.id,
      token: hashedToken,
      expires_at: expiresAtIso,
      is_single_use: true,
      metadata: {
        scope: "wallet.qr",
        couponCode: coupon.code,
      },
    })
    .select("id, expires_at")
    .single();

  if (insertError) {
    console.error("Failed to create QR token", insertError);
    return NextResponse.json(
      { error: "Unable to create QR token" },
      { status: 500 },
    );
  }

  const updatedWallet = await transitionWallet({
    client: supabase,
    wallet,
    walletId,
    nextStatus: "claimed",
    event: {
      type: "wallet.qr_created",
      message: `QR token issued for coupon ${coupon.code}`,
      at: nowIso,
      details: {
        couponId: coupon.id,
        qrTokenId: insertedToken.id,
        expiresAt: expiresAtIso,
        storeId: store.id,
      },
    },
    eventContext: {
      couponId: coupon.id,
      storeId: store.id,
      qrTokenId: insertedToken.id,
      actorId: userId,
    },
    eventSource: "api.wallet.qr.create",
    mutateMetadata: (metadata) => {
      const nextMetadata = { ...metadata };
      const { couponState } = ensureCouponState(nextMetadata);

      couponState.couponId = coupon.id;
      couponState.couponCode = coupon.code;
      couponState.status = "claimed";
      couponState.claimedAt = couponState.claimedAt ?? nowIso;
      couponState.lastUpdatedAt = nowIso;
      couponState.qrTokenId = insertedToken.id;
      couponState.qrTokenExpiresAt = expiresAtIso;
      couponState.redeemedAt = null;

      nextMetadata.couponState = couponState;
      return nextMetadata;
    },
  });

  return NextResponse.json(
    {
      token: rawToken,
      expiresAt: insertedToken.expires_at,
      wallet: {
        id: updatedWallet.id,
        status: updatedWallet.status,
        metadata: updatedWallet.metadata,
      },
    },
    { status: 201 },
  );
}
