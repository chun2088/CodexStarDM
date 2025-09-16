import { NextResponse } from "next/server";

import { getSupabaseAdminClient } from "@/lib/supabase-client";
import {
  extractStoreStatusFromCoupon,
  isFeatureAllowed,
  type StoreRecord,
} from "@/lib/store-service";

type CouponRow = {
  id: string;
  code: string;
  name: string | null;
  description: string | null;
  discount_type: string;
  discount_value: number;
  max_redemptions: number | null;
  redeemed_count: number;
  start_at: string | null;
  end_at: string | null;
  is_active: boolean;
  metadata: Record<string, unknown> | null;
  store_id: string | null;
  merchant_id: string | null;
};

type CouponPayload = {
  id: string;
  code: string;
  name: string | null;
  description: string | null;
  discountType: string;
  discountValue: number;
  startAt: string | null;
  endAt: string | null;
  metadata: Record<string, unknown> | null;
  redeemedCount: number;
  maxRedemptions: number | null;
  storeId: string | null;
};

function isClaimable(coupon: CouponRow, now: Date) {
  if (!coupon.is_active) {
    return false;
  }

  if (coupon.start_at && new Date(coupon.start_at) > now) {
    return false;
  }

  if (coupon.end_at && new Date(coupon.end_at) < now) {
    return false;
  }

  if (
    coupon.max_redemptions !== null &&
    coupon.redeemed_count >= coupon.max_redemptions
  ) {
    return false;
  }

  return true;
}

export async function GET() {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("coupons")
    .select(
      "id, code, name, description, discount_type, discount_value, max_redemptions, redeemed_count, start_at, end_at, is_active, metadata, store_id, merchant_id",
    );

  if (error) {
    console.error("Failed to fetch coupons", error);
    return NextResponse.json(
      { error: "Unable to load coupons" },
      { status: 500 },
    );
  }

  const now = new Date();
  const couponRows = (data ?? []) as CouponRow[];
  const ownerIds = Array.from(
    new Set(
      couponRows
        .map((coupon) => coupon.merchant_id)
        .filter((value): value is string => Boolean(value)),
    ),
  );

  let stores: StoreRecord[] = [];

  if (ownerIds.length > 0) {
    const { data: storeRows, error: storeError } = await supabase
      .from("stores")
      .select("id, owner_id, subscription_status, name")
      .in("owner_id", ownerIds);

    if (storeError) {
      console.error("Failed to load stores for coupons", storeError);
      return NextResponse.json(
        { error: "Unable to determine coupon availability" },
        { status: 500 },
      );
    }

    stores = (storeRows ?? []) as StoreRecord[];
  }

  const storesById = new Map(stores.map((store) => [store.id, store]));
  const storesByOwner = new Map(stores.map((store) => [store.owner_id, store]));

  const coupons: CouponPayload[] = [];

  for (const coupon of couponRows) {
    if (!isClaimable(coupon, now)) {
      continue;
    }

    const store = extractStoreStatusFromCoupon(coupon, storesById, storesByOwner);

    if (!store) {
      continue;
    }

    if (!isFeatureAllowed(store.subscription_status)) {
      continue;
    }

    coupons.push({
      id: coupon.id,
      code: coupon.code,
      name: coupon.name,
      description: coupon.description,
      discountType: coupon.discount_type,
      discountValue: coupon.discount_value,
      startAt: coupon.start_at,
      endAt: coupon.end_at,
      metadata: coupon.metadata,
      redeemedCount: coupon.redeemed_count,
      maxRedemptions: coupon.max_redemptions,
      storeId: coupon.store_id,
    });
  }

  return NextResponse.json({ coupons });
}
