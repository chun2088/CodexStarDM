import type { SupabaseClient } from "@supabase/supabase-js";

export type StoreSubscriptionStatus = "active" | "grace" | "canceled";

export type StoreRecord = {
  id: string;
  owner_id: string;
  subscription_status: StoreSubscriptionStatus;
  name?: string | null;
};

export type StoreInviteRecord = {
  id: string;
  code: string;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
  is_active: boolean;
};

export type StoreSubscriptionRecord = {
  id: string;
  store_id: string;
  plan_id: string | null;
  billing_profile_id: string | null;
  status: StoreSubscriptionStatus;
  current_period_start: string | null;
  current_period_end: string | null;
  grace_until: string | null;
  canceled_at: string | null;
  metadata: Record<string, unknown> | null;
};

export type SubscriptionEvent = {
  type: string;
  at: string;
  details?: Record<string, unknown>;
};

const ACTIVE_FEATURE_STATUSES: ReadonlySet<StoreSubscriptionStatus> = new Set([
  "active",
  "grace",
]);

const MAX_STORED_EVENTS = 50;

export class StoreFeatureAccessError extends Error {
  readonly status: StoreSubscriptionStatus;
  readonly feature: string;

  constructor(status: StoreSubscriptionStatus, feature: string, message?: string) {
    super(message ?? `Store subscription does not allow feature: ${feature}`);
    this.name = "StoreFeatureAccessError";
    this.status = status;
    this.feature = feature;
  }
}

function normalizeInviteCode(value: string) {
  return value.trim().toUpperCase();
}

function appendEvent(
  metadata: Record<string, unknown> | null | undefined,
  event: SubscriptionEvent,
) {
  const nextMetadata: Record<string, unknown> = metadata ? { ...metadata } : {};
  const existing = nextMetadata.events;
  const events = Array.isArray(existing) ? [...existing] : [];
  events.push(event);
  nextMetadata.events = events.slice(-MAX_STORED_EVENTS);
  return nextMetadata;
}

export async function findInviteCode(
  client: SupabaseClient,
  code: string,
): Promise<(StoreInviteRecord & { metadata?: Record<string, unknown> | null }) | null> {
  const normalized = normalizeInviteCode(code);
  const { data, error } = await client
    .from("store_invite_codes")
    .select("id, code, max_uses, used_count, expires_at, is_active, metadata")
    .ilike("code", normalized)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as (StoreInviteRecord & { metadata?: Record<string, unknown> | null }) | null;
}

export function ensureInviteIsUsable(invite: StoreInviteRecord) {
  if (!invite.is_active) {
    throw new Error("Invite code is no longer active");
  }

  if (invite.expires_at && new Date(invite.expires_at) <= new Date()) {
    throw new Error("Invite code has expired");
  }

  if (invite.max_uses !== null && invite.used_count >= invite.max_uses) {
    throw new Error("Invite code has reached its usage limit");
  }
}

export async function markInviteCodeUsed(
  client: SupabaseClient,
  invite: StoreInviteRecord,
) {
  const nextUsedCount = invite.used_count + 1;
  const hasReachedLimit =
    invite.max_uses !== null && nextUsedCount >= invite.max_uses;
  const nowIso = new Date().toISOString();

  const { data, error } = await client
    .from("store_invite_codes")
    .update({
      used_count: nextUsedCount,
      last_used_at: nowIso,
      is_active: hasReachedLimit ? false : invite.is_active,
    })
    .eq("id", invite.id)
    .eq("used_count", invite.used_count)
    .select("id, used_count, max_uses, is_active")
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("Invite code usage conflict detected");
  }

  return data as StoreInviteRecord;
}

export async function fetchStoreById(client: SupabaseClient, storeId: string) {
  const { data, error } = await client
    .from("stores")
    .select("id, owner_id, subscription_status, name")
    .eq("id", storeId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as StoreRecord | null;
}

export async function fetchStoreByOwner(
  client: SupabaseClient,
  ownerId: string,
) {
  const { data, error } = await client
    .from("stores")
    .select("id, owner_id, subscription_status, name")
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as StoreRecord | null;
}

export function isFeatureAllowed(status: StoreSubscriptionStatus) {
  return ACTIVE_FEATURE_STATUSES.has(status);
}

export function assertStoreFeatureAccess(
  status: StoreSubscriptionStatus,
  feature: string,
  storeName?: string | null,
) {
  if (!isFeatureAllowed(status)) {
    const label = storeName ? `${storeName}` : "store";
    throw new StoreFeatureAccessError(
      status,
      feature,
      `${label} subscription is ${status}. Access to ${feature} is restricted until the subscription is reactivated.`,
    );
  }
}

export type StoreSubscriptionUpdateInput = {
  status: StoreSubscriptionStatus;
  planId?: string | null;
  billingProfileId?: string | null;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  graceUntil?: string | null;
  canceledAt?: string | null;
  metadataPatch?: Record<string, unknown>;
  event?: SubscriptionEvent;
};

export async function upsertStoreSubscription(
  client: SupabaseClient,
  storeId: string,
  input: StoreSubscriptionUpdateInput,
) {
  const { data: existing, error: existingError } = await client
    .from("store_subscriptions")
    .select(
      "id, store_id, plan_id, billing_profile_id, status, current_period_start, current_period_end, grace_until, canceled_at, metadata",
    )
    .eq("store_id", storeId)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  const payload: Record<string, unknown> = {
    status: input.status,
  };

  if (input.planId !== undefined) {
    payload.plan_id = input.planId;
  }

  if (input.billingProfileId !== undefined) {
    payload.billing_profile_id = input.billingProfileId;
  }

  if (input.currentPeriodStart !== undefined) {
    payload.current_period_start = input.currentPeriodStart;
  }

  if (input.currentPeriodEnd !== undefined) {
    payload.current_period_end = input.currentPeriodEnd;
  }

  if (input.graceUntil !== undefined) {
    payload.grace_until = input.graceUntil;
  }

  if (input.canceledAt !== undefined) {
    payload.canceled_at = input.canceledAt;
  }

  let nextMetadata = existing?.metadata
    ? { ...(existing.metadata as Record<string, unknown>) }
    : {};
  if (input.metadataPatch) {
    nextMetadata = { ...nextMetadata, ...input.metadataPatch };
  }

  if (input.event) {
    nextMetadata = appendEvent(nextMetadata, input.event);
  }

  payload.metadata = nextMetadata;

  let subscriptionResponse;

  if (existing) {
    subscriptionResponse = await client
      .from("store_subscriptions")
      .update(payload)
      .eq("id", existing.id)
      .select(
        "id, store_id, plan_id, billing_profile_id, status, current_period_start, current_period_end, grace_until, canceled_at, metadata",
      )
      .maybeSingle();
  } else {
    subscriptionResponse = await client
      .from("store_subscriptions")
      .insert({ ...payload, store_id: storeId })
      .select(
        "id, store_id, plan_id, billing_profile_id, status, current_period_start, current_period_end, grace_until, canceled_at, metadata",
      )
      .single();
  }

  if (subscriptionResponse.error) {
    throw subscriptionResponse.error;
  }

  if (!subscriptionResponse.data) {
    throw new Error("Unable to persist store subscription state");
  }

  const updatedSubscription = subscriptionResponse.data as StoreSubscriptionRecord;

  const { error: storeError } = await client
    .from("stores")
    .update({ subscription_status: input.status })
    .eq("id", storeId);

  if (storeError) {
    throw storeError;
  }

  return updatedSubscription;
}

export function calculatePeriodEnd(
  start: Date,
  interval: "day" | "week" | "month" | "year",
  count: number,
) {
  const safeCount = Number.isFinite(count) && count > 0 ? Math.floor(count) : 1;
  const next = new Date(start);

  switch (interval) {
    case "day":
      next.setDate(next.getDate() + safeCount);
      break;
    case "week":
      next.setDate(next.getDate() + safeCount * 7);
      break;
    case "month":
      next.setMonth(next.getMonth() + safeCount);
      break;
    case "year":
      next.setFullYear(next.getFullYear() + safeCount);
      break;
    default:
      next.setMonth(next.getMonth() + safeCount);
      break;
  }

  return next;
}

export async function fetchStoreForCoupon(
  client: SupabaseClient,
  couponId: string,
  merchantId?: string | null,
) {
  if (!couponId) {
    return null;
  }

  const { data: couponRow, error: couponError } = await client
    .from("coupons")
    .select("store_id, merchant_id")
    .eq("id", couponId)
    .maybeSingle();

  if (couponError) {
    throw couponError;
  }

  if (couponRow?.store_id) {
    const store = await fetchStoreById(client, couponRow.store_id);
    if (store) {
      return store;
    }
  }

  const ownerId = couponRow?.merchant_id ?? merchantId;

  if (ownerId) {
    return fetchStoreByOwner(client, ownerId);
  }

  return null;
}

export function extractStoreStatusFromCoupon(
  coupon: { store_id?: string | null; merchant_id?: string | null },
  storesById: Map<string, StoreRecord>,
  storesByOwner: Map<string, StoreRecord>,
) {
  if (coupon.store_id) {
    const store = storesById.get(coupon.store_id);
    if (store) {
      return store;
    }
  }

  if (coupon.merchant_id) {
    const store = storesByOwner.get(coupon.merchant_id);
    if (store) {
      return store;
    }
  }

  return null;
}
