import type { SupabaseClient } from "@supabase/supabase-js";

import { isRecord, normalizeString } from "./utils/data";

type CouponLifecycleStatus = "draft" | "pending" | "active" | "paused" | "archived";

export type CouponApprovalStatus = "pending" | "approved" | "rejected";

export type CouponApprovalHistoryEntry = {
  status: CouponApprovalStatus;
  decidedAt: string | null;
  decidedBy: string | null;
  reason: string | null;
};

export type CouponApprovalState = {
  status: CouponApprovalStatus;
  decidedAt: string | null;
  decidedBy: string | null;
  reason: string | null;
  history?: CouponApprovalHistoryEntry[];
};

export type CouponApprovalUpdateInput = {
  status: CouponApprovalStatus;
  decidedBy?: string | null;
  reason?: string | null;
};

export class CouponNotFoundError extends Error {
  constructor(id: string) {
    super(`Coupon ${id} not found`);
    this.name = "CouponNotFoundError";
  }
}

function cloneMetadata(metadata: unknown) {
  if (!isRecord(metadata)) {
    return {} as Record<string, unknown>;
  }

  try {
    return structuredClone(metadata as Record<string, unknown>);
  } catch (error) {
    console.warn("structuredClone failed for coupon metadata", error);
    try {
      return JSON.parse(JSON.stringify(metadata)) as Record<string, unknown>;
    } catch (parseError) {
      console.warn("Unable to clone coupon metadata", parseError);
      return { ...(metadata as Record<string, unknown>) };
    }
  }
}

function coerceStatus(value: unknown, fallback: CouponApprovalStatus) {
  if (typeof value !== "string") {
    return fallback;
  }

  if (value === "pending" || value === "approved" || value === "rejected") {
    return value;
  }

  return fallback;
}

function sanitizeHistory(history: unknown) {
  if (!Array.isArray(history)) {
    return undefined;
  }

  const entries: CouponApprovalHistoryEntry[] = [];

  for (const entry of history) {
    if (!isRecord(entry)) {
      continue;
    }

    const status = coerceStatus(entry.status, "pending");
    const decidedAt = normalizeString(entry.decidedAt, { trim: false });
    const decidedBy = normalizeString(entry.decidedBy, { trim: false });
    const reason = normalizeString(entry.reason, { trim: false });

    entries.push({ status, decidedAt, decidedBy, reason });
  }

  return entries.length > 0 ? entries : undefined;
}

export function resolveCouponApproval(
  metadata: unknown,
  isActive: boolean,
): CouponApprovalState {
  const fallback: CouponApprovalState = {
    status: isActive ? "approved" : "pending",
    decidedAt: null,
    decidedBy: null,
    reason: null,
  };

  if (!isRecord(metadata)) {
    return fallback;
  }

  const approval = isRecord(metadata.salesApproval) ? metadata.salesApproval : null;

  if (!approval) {
    return fallback;
  }

  const status = coerceStatus(approval.status, fallback.status);
  const decidedAt = normalizeString(approval.decidedAt, { trim: false });
  const decidedBy = normalizeString(approval.decidedBy, { trim: false });
  const reason = normalizeString(approval.reason, { trim: false });
  const history = sanitizeHistory(approval.history);

  return {
    status,
    decidedAt,
    decidedBy,
    reason,
    history,
  };
}

const MAX_APPROVAL_HISTORY = 10;

export async function updateCouponApproval(
  client: SupabaseClient,
  couponId: string,
  input: CouponApprovalUpdateInput,
) {
  const { data: coupon, error: couponError } = await client
    .from("coupons")
    .select("id, metadata, is_active, status")
    .eq("id", couponId)
    .maybeSingle();

  if (couponError) {
    throw couponError;
  }

  if (!coupon) {
    throw new CouponNotFoundError(couponId);
  }

  const metadataClone = cloneMetadata(coupon.metadata);
  const currentApproval = resolveCouponApproval(metadataClone, coupon.is_active);

  const nowIso = new Date().toISOString();
  const nextReason =
    input.status === "rejected" ? normalizeString(input.reason, { trim: false }) : null;
  const decidedByValue = normalizeString(input.decidedBy, { trim: false });
  const existingHistory = Array.isArray(currentApproval.history)
    ? [...currentApproval.history]
    : [];
  const previousHistory =
    existingHistory.length > 0 ? existingHistory.slice(0, -1) : [];

  if (
    currentApproval.status !== "pending" ||
    currentApproval.decidedAt !== null ||
    currentApproval.decidedBy !== null ||
    currentApproval.reason !== null
  ) {
    previousHistory.push({
      status: currentApproval.status,
      decidedAt: currentApproval.decidedAt,
      decidedBy: currentApproval.decidedBy,
      reason: currentApproval.reason,
    });
  }

  const trimmedHistory = previousHistory.slice(-(MAX_APPROVAL_HISTORY - 1));
  const nextEntry: CouponApprovalHistoryEntry = {
    status: input.status,
    decidedAt: nowIso,
    decidedBy: decidedByValue,
    reason: nextReason,
  };

  const nextApproval: CouponApprovalState = {
    status: nextEntry.status,
    decidedAt: nextEntry.decidedAt,
    decidedBy: nextEntry.decidedBy,
    reason: nextEntry.reason,
    history: [...trimmedHistory, nextEntry],
  };

  metadataClone.salesApproval = nextApproval;

  const currentStatus = ((coupon.status as string | null) ?? (coupon.is_active ? "active" : "draft"))
    .toLowerCase() as CouponLifecycleStatus;
  let nextCouponStatus: CouponLifecycleStatus = currentStatus;

  switch (input.status) {
    case "approved":
      nextCouponStatus = "active";
      break;
    case "pending":
      nextCouponStatus = "pending";
      break;
    case "rejected":
      nextCouponStatus = "draft";
      break;
    default:
      nextCouponStatus = currentStatus;
      break;
  }

  const shouldActivate = nextCouponStatus === "active";
  const updatePayload: Record<string, unknown> = {
    metadata: metadataClone,
  };

  if (nextCouponStatus !== currentStatus) {
    updatePayload.status = nextCouponStatus;
  }

  if (shouldActivate !== coupon.is_active) {
    updatePayload.is_active = shouldActivate;
  }

  const { error: updateError } = await client
    .from("coupons")
    .update(updatePayload)
    .eq("id", couponId);

  if (updateError) {
    throw updateError;
  }

  return nextApproval;
}
