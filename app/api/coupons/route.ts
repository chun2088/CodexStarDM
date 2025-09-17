import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { recordEvent } from "@/lib/event-service";
import { getSupabaseAdminClient } from "@/lib/supabase-client";
import {
  StoreFeatureAccessError,
  assertStoreFeatureAccess,
  extractStoreStatusFromCoupon,
  fetchStoreById,
  fetchStoreByOwner,
  isFeatureAllowed,
  type StoreRecord,
} from "@/lib/store-service";

type CouponStatus = "draft" | "pending" | "active" | "paused" | "archived";

type CouponDiscountType = "percentage" | "fixed";

type AuthenticatedMerchant = {
  merchantId: string;
};

const ACCESS_TOKEN_COOKIE_NAME = "sb-access-token";
const CODE_REGEX = /^[A-Z0-9-]+$/;
const MAX_CODE_LENGTH = 32;
const MAX_NAME_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 1000;

const MERCHANT_EDITABLE_STATUSES: ReadonlySet<CouponStatus> = new Set(["draft", "pending"]);

const STATUS_SEQUENCE: ReadonlySet<CouponStatus> = new Set([
  "draft",
  "pending",
  "active",
  "paused",
  "archived",
]);

function isCouponStatus(value: unknown): value is CouponStatus {
  return typeof value === "string" && STATUS_SEQUENCE.has(value as CouponStatus);
}

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

function normalizeCode(value: unknown) {
  if (typeof value !== "string") {
    throw new Error("code is required");
  }

  const normalized = value.trim().toUpperCase();

  if (normalized.length < 3 || normalized.length > MAX_CODE_LENGTH) {
    throw new Error("code must be between 3 and 32 characters");
  }

  if (!CODE_REGEX.test(normalized)) {
    throw new Error("code must contain only letters, numbers, or hyphens");
  }

  return normalized;
}

function normalizeName(value: unknown) {
  if (typeof value !== "string") {
    throw new Error("name is required");
  }

  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error("name is required");
  }

  if (trimmed.length > MAX_NAME_LENGTH) {
    throw new Error("name must be 120 characters or fewer");
  }

  return trimmed;
}

function normalizeDescription(value: unknown) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error("description must be a string");
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if (trimmed.length > MAX_DESCRIPTION_LENGTH) {
    throw new Error("description must be 1000 characters or fewer");
  }

  return trimmed;
}

function normalizeDiscountType(value: unknown) {
  if (typeof value !== "string") {
    throw new Error("discountType is required");
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "fixed" || normalized === "flat") {
    return "fixed" as CouponDiscountType;
  }

  if (normalized === "percentage" || normalized === "percent") {
    return "percentage" as CouponDiscountType;
  }

  throw new Error("discountType must be 'flat' or 'percent'");
}

function normalizeDiscountValue(value: unknown, discountType: CouponDiscountType) {
  if (typeof value !== "number") {
    throw new Error("discountValue must be a number");
  }

  if (!Number.isFinite(value)) {
    throw new Error("discountValue must be a finite number");
  }

  if (value <= 0) {
    throw new Error("discountValue must be greater than zero");
  }

  if (discountType === "percentage" && value > 100) {
    throw new Error("percentage discounts cannot exceed 100");
  }

  return Number(value.toFixed(2));
}

function normalizeMaxRedemptions(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const numericValue = typeof value === "string" ? Number(value) : value;

  if (typeof numericValue !== "number" || !Number.isFinite(numericValue)) {
    throw new Error("maxRedemptions must be a positive integer or null");
  }

  const intValue = Math.floor(numericValue);

  if (intValue <= 0) {
    throw new Error("maxRedemptions must be greater than zero if provided");
  }

  return intValue;
}

function normalizeDateInput(value: unknown, field: string) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error(`${field} must be a string or null`);
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const parsed = new Date(trimmed);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${field} must be a valid ISO timestamp`);
  }

  return parsed.toISOString();
}

function validateWindow(startAt: string | null | undefined, endAt: string | null | undefined) {
  if (startAt && endAt) {
    if (new Date(startAt) >= new Date(endAt)) {
      throw new Error("endAt must be later than startAt");
    }
  }
}

function normalizeStatus(value: unknown) {
  if (!isCouponStatus(value)) {
    throw new Error("status is invalid");
  }

  return value;
}

function isMerchantEditable(status: CouponStatus) {
  return MERCHANT_EDITABLE_STATUSES.has(status);
}

function canMerchantTransition(current: CouponStatus, next: CouponStatus) {
  if (!isMerchantEditable(current) || !isMerchantEditable(next)) {
    return false;
  }

  if (current === next) {
    return true;
  }

  if (current === "draft" && next === "pending") {
    return true;
  }

  if (current === "pending" && next === "draft") {
    return true;
  }

  return false;
}

async function authenticateMerchant(request: Request) {
  const accessToken = extractAccessToken(request);

  if (!accessToken) {
    return {
      error: NextResponse.json({ error: "Authentication required" }, { status: 401 }),
    } as const;
  }

  const supabase = getSupabaseAdminClient();

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
      error: NextResponse.json({ error: "Only merchants can manage coupons" }, { status: 403 }),
    } as const;
  }

  return { merchantId } satisfies AuthenticatedMerchant;
}

async function resolveMerchantStore(
  supabase = getSupabaseAdminClient(),
  merchantId: string,
  providedStoreId?: string | null,
): Promise<StoreRecord> {
  if (providedStoreId) {
    const store = await fetchStoreById(supabase, providedStoreId);

    if (!store || store.owner_id !== merchantId) {
      throw new Error("Store not found for merchant");
    }

    return store;
  }

  const store = await fetchStoreByOwner(supabase, merchantId);

  if (!store) {
    throw new Error("Store not found for merchant");
  }

  return store;
}

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
  status: CouponStatus;
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
  if (coupon.status !== "active") {
    return false;
  }

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
      "id, code, name, description, discount_type, discount_value, max_redemptions, redeemed_count, start_at, end_at, status, is_active, metadata, store_id, merchant_id",
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

type CreateCouponRequest = {
  code?: unknown;
  name?: unknown;
  description?: unknown;
  discountType?: unknown;
  discountValue?: unknown;
  maxRedemptions?: unknown;
  startAt?: unknown;
  endAt?: unknown;
  storeId?: unknown;
};

export async function POST(request: Request) {
  const authResult = await authenticateMerchant(request);

  if ("error" in authResult) {
    return authResult.error;
  }

  let body: CreateCouponRequest;

  try {
    body = (await request.json()) as CreateCouponRequest;
  } catch (error) {
    console.error("Failed to parse coupon draft payload", error);
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  const storeIdInput = typeof body.storeId === "string" ? body.storeId : null;

  let store: StoreRecord;

  try {
    store = await resolveMerchantStore(supabase, authResult.merchantId, storeIdInput);
  } catch {
    return NextResponse.json({ error: "Store not found for merchant" }, { status: 404 });
  }

  try {
    assertStoreFeatureAccess(store.subscription_status, "coupon.authoring", store.name);
  } catch (error) {
    if (error instanceof StoreFeatureAccessError) {
      return NextResponse.json(
        { error: error.message, subscriptionStatus: error.status },
        { status: 403 },
      );
    }

    throw error;
  }

  let code: string;
  let name: string;
  let description: string | null;
  let discountType: CouponDiscountType;
  let discountValue: number;
  let maxRedemptions: number | null;
  let startAt: string | null | undefined;
  let endAt: string | null | undefined;

  try {
    code = normalizeCode(body.code);
    name = normalizeName(body.name);
    description = normalizeDescription(body.description);
    discountType = normalizeDiscountType(body.discountType);
    discountValue = normalizeDiscountValue(body.discountValue, discountType);
    maxRedemptions = normalizeMaxRedemptions(body.maxRedemptions);
    startAt = normalizeDateInput(body.startAt, "startAt");
    endAt = normalizeDateInput(body.endAt, "endAt");
    validateWindow(startAt ?? null, endAt ?? null);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }

  const payload = {
    merchant_id: authResult.merchantId,
    store_id: store.id,
    code,
    name,
    description,
    discount_type: discountType,
    discount_value: discountValue,
    max_redemptions: maxRedemptions,
    start_at: startAt ?? null,
    end_at: endAt ?? null,
    status: "draft" as CouponStatus,
    is_active: false,
  };

  const { data: insertResult, error: insertError } = await supabase
    .from("coupons")
    .insert(payload)
    .select("id, code, store_id, status")
    .maybeSingle();

  if (insertError) {
    if (typeof insertError === "object" && insertError && "code" in insertError && insertError.code === "23505") {
      return NextResponse.json({ error: "Coupon code already exists" }, { status: 409 });
    }

    console.error("Failed to create coupon draft", insertError);
    return NextResponse.json({ error: "Unable to create coupon" }, { status: 500 });
  }

  if (!insertResult) {
    return NextResponse.json({ error: "Coupon creation failed" }, { status: 500 });
  }

  try {
    await recordEvent(supabase, {
      type: "coupon.created",
      source: "api.coupons.post",
      message: `Coupon ${code} draft created`,
      context: {
        couponId: insertResult.id,
        storeId: insertResult.store_id,
        actorId: authResult.merchantId,
        nextStatus: insertResult.status,
      },
      details: {
        discountType,
        discountValue,
        maxRedemptions,
        startAt: startAt ?? null,
        endAt: endAt ?? null,
      },
    });
  } catch (error) {
    console.error("Failed to record coupon creation event", error);
  }

  return NextResponse.json({ message: "Coupon draft created", couponId: insertResult.id });
}

type UpdateCouponRequest = {
  id?: unknown;
  code?: unknown;
  name?: unknown;
  description?: unknown;
  discountType?: unknown;
  discountValue?: unknown;
  maxRedemptions?: unknown;
  startAt?: unknown;
  endAt?: unknown;
  status?: unknown;
  storeId?: unknown;
};

export async function PATCH(request: Request) {
  const authResult = await authenticateMerchant(request);

  if ("error" in authResult) {
    return authResult.error;
  }

  let body: UpdateCouponRequest;

  try {
    body = (await request.json()) as UpdateCouponRequest;
  } catch (error) {
    console.error("Failed to parse coupon update payload", error);
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Request body must be an object" }, { status: 400 });
  }

  const couponIdRaw = body.id;

  if (typeof couponIdRaw !== "string" || !couponIdRaw.trim()) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const couponId = couponIdRaw.trim();
  const supabase = getSupabaseAdminClient();

  const providedStoreId =
    typeof body.storeId === "string" && body.storeId.trim() ? body.storeId.trim() : null;

  const { data: couponRow, error: couponError } = await supabase
    .from("coupons")
    .select(
      "id, code, name, description, discount_type, discount_value, max_redemptions, start_at, end_at, status, is_active, store_id, merchant_id, metadata",
    )
    .eq("id", couponId)
    .maybeSingle();

  if (couponError) {
    console.error("Failed to load coupon for update", couponError);
    return NextResponse.json({ error: "Unable to load coupon" }, { status: 500 });
  }

  if (!couponRow || couponRow.merchant_id !== authResult.merchantId) {
    return NextResponse.json({ error: "Coupon not found" }, { status: 404 });
  }

  if (!couponRow.store_id) {
    return NextResponse.json({ error: "Coupon is not linked to a store" }, { status: 409 });
  }

  if (providedStoreId && providedStoreId !== couponRow.store_id) {
    return NextResponse.json({ error: "Store cannot be reassigned for an existing coupon" }, { status: 400 });
  }

  if (!isMerchantEditable(couponRow.status)) {
    return NextResponse.json(
      { error: `Coupons in ${couponRow.status} status cannot be edited by merchants` },
      { status: 409 },
    );
  }

  let store: StoreRecord;

  try {
    store = await resolveMerchantStore(supabase, authResult.merchantId, couponRow.store_id);
  } catch {
    return NextResponse.json({ error: "Store not found for merchant" }, { status: 404 });
  }

  try {
    assertStoreFeatureAccess(store.subscription_status, "coupon.authoring", store.name);
  } catch (error) {
    if (error instanceof StoreFeatureAccessError) {
      return NextResponse.json(
        { error: error.message, subscriptionStatus: error.status },
        { status: 403 },
      );
    }

    throw error;
  }

  const updatePayload: Record<string, unknown> = {};
  const changedFields: string[] = [];

  try {
    if (Object.prototype.hasOwnProperty.call(body, "code")) {
      const nextCode = normalizeCode(body.code);
      if (nextCode !== couponRow.code) {
        updatePayload.code = nextCode;
        changedFields.push("code");
      }
    }

    if (Object.prototype.hasOwnProperty.call(body, "name")) {
      const nextName = normalizeName(body.name);
      if (nextName !== (couponRow.name ?? "")) {
        updatePayload.name = nextName;
        changedFields.push("name");
      }
    }

    if (Object.prototype.hasOwnProperty.call(body, "description")) {
      const nextDescription = normalizeDescription(body.description);
      if (nextDescription !== couponRow.description) {
        updatePayload.description = nextDescription;
        changedFields.push("description");
      }
    }

    let effectiveDiscountType = couponRow.discount_type as CouponDiscountType;

    if (Object.prototype.hasOwnProperty.call(body, "discountType")) {
      const nextType = normalizeDiscountType(body.discountType);
      if (nextType !== couponRow.discount_type) {
        updatePayload.discount_type = nextType;
        changedFields.push("discount_type");
      }
      effectiveDiscountType = nextType;
    }

    if (Object.prototype.hasOwnProperty.call(body, "discountValue")) {
      const nextValue = normalizeDiscountValue(body.discountValue, effectiveDiscountType);
      if (nextValue !== couponRow.discount_value) {
        updatePayload.discount_value = nextValue;
        changedFields.push("discount_value");
      }
    } else if (updatePayload.discount_type) {
      normalizeDiscountValue(couponRow.discount_value, effectiveDiscountType);
    }

    if (Object.prototype.hasOwnProperty.call(body, "maxRedemptions")) {
      const nextMax = normalizeMaxRedemptions(body.maxRedemptions);
      if (nextMax !== couponRow.max_redemptions) {
        updatePayload.max_redemptions = nextMax;
        changedFields.push("max_redemptions");
      }
    }

    let nextStartAt = couponRow.start_at;
    let nextEndAt = couponRow.end_at;

    if (Object.prototype.hasOwnProperty.call(body, "startAt")) {
      nextStartAt = normalizeDateInput(body.startAt, "startAt") ?? null;
      if (nextStartAt !== couponRow.start_at) {
        updatePayload.start_at = nextStartAt;
        changedFields.push("start_at");
      }
    }

    if (Object.prototype.hasOwnProperty.call(body, "endAt")) {
      nextEndAt = normalizeDateInput(body.endAt, "endAt") ?? null;
      if (nextEndAt !== couponRow.end_at) {
        updatePayload.end_at = nextEndAt;
        changedFields.push("end_at");
      }
    }

    validateWindow(
      Object.prototype.hasOwnProperty.call(body, "startAt") ? (updatePayload.start_at as string | null | undefined) ?? nextStartAt : nextStartAt,
      Object.prototype.hasOwnProperty.call(body, "endAt") ? (updatePayload.end_at as string | null | undefined) ?? nextEndAt : nextEndAt,
    );

    if (Object.prototype.hasOwnProperty.call(body, "status")) {
      const providedStatus = normalizeStatus(body.status);
      if (!canMerchantTransition(couponRow.status, providedStatus)) {
        throw new Error("Invalid status transition for merchant");
      }

      if (providedStatus !== couponRow.status) {
        updatePayload.status = providedStatus;
        updatePayload.is_active = providedStatus === "active";
        changedFields.push("status");
      }
    }
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }

  const nextStatus = (updatePayload.status as CouponStatus | undefined) ?? couponRow.status;

  if (!canMerchantTransition(couponRow.status, nextStatus)) {
    return NextResponse.json({ error: "Coupons can only be moved between draft and pending by merchants" }, { status: 409 });
  }

  if (Object.keys(updatePayload).length === 0) {
    return NextResponse.json({ error: "No changes detected" }, { status: 400 });
  }

  if (!updatePayload.status) {
    updatePayload.status = couponRow.status;
  }

  if (!Object.prototype.hasOwnProperty.call(updatePayload, "is_active")) {
    updatePayload.is_active = (updatePayload.status as CouponStatus) === "active";
  }

  const { data: updatedCoupon, error: updateError } = await supabase
    .from("coupons")
    .update(updatePayload)
    .eq("id", couponId)
    .eq("merchant_id", authResult.merchantId)
    .select(
      "id, code, name, description, discount_type, discount_value, max_redemptions, start_at, end_at, status, is_active, store_id, merchant_id",
    )
    .maybeSingle();

  if (updateError) {
    if (typeof updateError === "object" && updateError && "code" in updateError && updateError.code === "23505") {
      return NextResponse.json({ error: "Coupon code already exists" }, { status: 409 });
    }

    console.error("Failed to update coupon", updateError);
    return NextResponse.json({ error: "Unable to update coupon" }, { status: 500 });
  }

  if (!updatedCoupon) {
    return NextResponse.json({ error: "Coupon update failed" }, { status: 500 });
  }

  try {
    await recordEvent(supabase, {
      type: "coupon.updated",
      source: "api.coupons.patch",
      message: `Coupon ${updatedCoupon.code} updated`,
      context: {
        couponId: updatedCoupon.id,
        storeId: updatedCoupon.store_id,
        actorId: authResult.merchantId,
        previousStatus: couponRow.status,
        nextStatus: updatedCoupon.status,
      },
      details: {
        changedFields,
      },
    });
  } catch (error) {
    console.error("Failed to record coupon update event", error);
  }

  return NextResponse.json({
    message: `Coupon ${updatedCoupon.code} updated`,
    couponId: updatedCoupon.id,
    status: updatedCoupon.status,
  });
}
