import { NextResponse } from "next/server";

import { resolveCouponApproval } from "@/lib/coupon-service";
import { getSupabaseAdminClient } from "@/lib/supabase-client";

type CouponRow = {
  id: string;
  code: string;
  name: string | null;
  description: string | null;
  discount_type: string;
  discount_value: number;
  start_at: string | null;
  end_at: string | null;
  is_active: boolean;
  metadata: unknown;
  merchant_id: string;
  store_id: string | null;
  created_at: string;
  updated_at: string;
};

type StoreRow = {
  id: string;
  name: string;
  subscription_status: string;
};

type UserRow = {
  id: string;
  email: string | null;
  full_name: string | null;
};

export async function GET() {
  const supabase = getSupabaseAdminClient();

  const { data: couponRows, error: couponError } = await supabase
    .from("coupons")
    .select(
      "id, code, name, description, discount_type, discount_value, start_at, end_at, is_active, metadata, merchant_id, store_id, created_at, updated_at",
    )
    .order("created_at", { ascending: false });

  if (couponError) {
    console.error("Failed to load coupons for sales approvals", couponError);
    return NextResponse.json(
      { error: "Unable to load coupons" },
      { status: 500 },
    );
  }

  const coupons = (couponRows ?? []) as CouponRow[];
  const merchantIds = Array.from(new Set(coupons.map((coupon) => coupon.merchant_id)));
  const storeIds = Array.from(
    new Set(
      coupons
        .map((coupon) => coupon.store_id)
        .filter((value): value is string => Boolean(value)),
    ),
  );

  let merchants: UserRow[] = [];

  if (merchantIds.length > 0) {
    const { data: merchantRows, error: merchantError } = await supabase
      .from("users")
      .select("id, email, full_name")
      .in("id", merchantIds);

    if (merchantError) {
      console.error("Failed to load coupon merchants", merchantError);
      return NextResponse.json(
        { error: "Unable to load coupon merchants" },
        { status: 500 },
      );
    }

    merchants = (merchantRows ?? []) as UserRow[];
  }

  let stores: StoreRow[] = [];

  if (storeIds.length > 0) {
    const { data: storeRows, error: storeError } = await supabase
      .from("stores")
      .select("id, name, subscription_status")
      .in("id", storeIds);

    if (storeError) {
      console.error("Failed to load stores for coupon approvals", storeError);
      return NextResponse.json(
        { error: "Unable to load stores" },
        { status: 500 },
      );
    }

    stores = (storeRows ?? []) as StoreRow[];
  }

  const merchantsById = new Map(merchants.map((merchant) => [merchant.id, merchant]));
  const storesById = new Map(stores.map((store) => [store.id, store]));

  const payload = coupons.map((coupon) => {
    const approval = resolveCouponApproval(coupon.metadata, coupon.is_active);
    const merchant = merchantsById.get(coupon.merchant_id);
    const store = coupon.store_id ? storesById.get(coupon.store_id) : null;

    return {
      id: coupon.id,
      code: coupon.code,
      name: coupon.name,
      description: coupon.description,
      discountType: coupon.discount_type,
      discountValue: coupon.discount_value,
      startAt: coupon.start_at,
      endAt: coupon.end_at,
      isActive: coupon.is_active,
      createdAt: coupon.created_at,
      updatedAt: coupon.updated_at,
      approval,
      merchant: merchant
        ? {
            id: merchant.id,
            email: merchant.email,
            name: merchant.full_name,
          }
        : {
            id: coupon.merchant_id,
            email: null,
            name: null,
          },
      store: store
        ? {
            id: store.id,
            name: store.name,
            subscriptionStatus: store.subscription_status,
          }
        : null,
    };
  });

  return NextResponse.json({ coupons: payload });
}
