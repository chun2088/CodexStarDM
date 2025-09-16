import { NextResponse } from "next/server";

import { getSupabaseAdminClient } from "@/lib/supabase-client";
import {
  StoreFeatureAccessError,
  assertStoreFeatureAccess,
  fetchStoreForCoupon,
} from "@/lib/store-service";
import { ensureCouponState, transitionWallet } from "@/lib/wallet-service";

type ClaimRequestBody = {
  userId?: string;
  walletId?: string;
};

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const couponId = params.id;

  if (!couponId) {
    return NextResponse.json(
      { error: "Coupon id is required" },
      { status: 400 },
    );
  }

  let body: ClaimRequestBody;

  try {
    body = await request.json();
  } catch (error) {
    console.error("Failed to parse claim payload", error);
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const { userId, walletId } = body ?? {};

  if (!userId || !walletId) {
    return NextResponse.json(
      { error: "userId and walletId are required" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdminClient();

  const { data: coupon, error: couponError } = await supabase
    .from("coupons")
    .select(
      "id, code, name, description, discount_type, discount_value, max_redemptions, redeemed_count, start_at, end_at, is_active, metadata, store_id, merchant_id",
    )
    .eq("id", couponId)
    .maybeSingle();

  if (couponError) {
    console.error("Failed to load coupon", couponError);
    return NextResponse.json(
      { error: "Unable to claim coupon" },
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
    console.error("Failed to load store for coupon claim", error);
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
    assertStoreFeatureAccess(store.subscription_status, "coupon.claim", store.name);
  } catch (error) {
    if (error instanceof StoreFeatureAccessError) {
      return NextResponse.json(
        { error: error.message, subscriptionStatus: error.status },
        { status: 402 },
      );
    }

    console.error("Unexpected store access error", error);
    return NextResponse.json(
      { error: "Unable to authorize coupon claim" },
      { status: 500 },
    );
  }

  const { data: wallet, error: walletError } = await supabase
    .from("wallets")
    .select("id, user_id, status, metadata")
    .eq("id", walletId)
    .maybeSingle();

  if (walletError) {
    console.error("Failed to load wallet", walletError);
    return NextResponse.json(
      { error: "Unable to process wallet" },
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

  const nowIso = now.toISOString();

  const { error: expireError } = await supabase
    .from("qr_tokens")
    .update({ expires_at: nowIso })
    .eq("wallet_id", walletId)
    .is("redeemed_at", null)
    .gt("expires_at", nowIso);

  if (expireError) {
    console.error("Failed to invalidate existing QR tokens", expireError);
  }

  const updatedWallet = await transitionWallet({
    client: supabase,
    wallet,
    walletId,
    nextStatus: "claimed",
    event: {
      type: "coupon.claimed",
      message: `Coupon ${coupon.code} claimed`,
      at: nowIso,
      details: {
        couponId: coupon.id,
        userId,
        storeId: store.id,
      },
    },
    mutateMetadata: (metadata) => {
      const nextMetadata = { ...metadata };
      const { couponState } = ensureCouponState(nextMetadata);

      couponState.couponId = coupon.id;
      couponState.couponCode = coupon.code;
      couponState.status = "claimed";
      couponState.claimedAt = nowIso;
      couponState.lastUpdatedAt = nowIso;
      couponState.qrTokenId = null;
      couponState.qrTokenExpiresAt = null;
      couponState.redeemedAt = null;

      nextMetadata.couponState = couponState;
      return nextMetadata;
    },
  });

  return NextResponse.json({
    message: "Coupon claimed",
    coupon: {
      id: coupon.id,
      code: coupon.code,
      name: coupon.name,
      description: coupon.description,
      discountType: coupon.discount_type,
      discountValue: coupon.discount_value,
      startAt: coupon.start_at,
      endAt: coupon.end_at,
      metadata: coupon.metadata,
      maxRedemptions: coupon.max_redemptions,
      redeemedCount: coupon.redeemed_count,
    },
    wallet: {
      id: updatedWallet.id,
      status: updatedWallet.status,
      metadata: updatedWallet.metadata,
    },
  });
}
