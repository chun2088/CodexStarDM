import type { SupabaseClient } from "@supabase/supabase-js";

import { recordEvent, type EventContext } from "./event-service";
import { isRecord, normalizeIsoTimestamp, normalizeString } from "./utils/data";

type JsonRecord = {
  [key: string]: unknown;
  events?: unknown;
  couponState?: unknown;
};

export type WalletMetadata = JsonRecord;

export type WalletStatus = "active" | "claimed" | "used" | "expired";

export type WalletRow = {
  id: string;
  user_id: string;
  status: string;
  metadata: JsonRecord | null;
};

export type WalletEvent = {
  type: string;
  message: string;
  at: string;
  details?: Record<string, unknown>;
};

export type WalletMetadataMutator = (metadata: JsonRecord) => JsonRecord;

const MAX_STORED_EVENTS = 25;

function cloneMetadata(metadata: unknown): JsonRecord {
  if (!isRecord(metadata)) {
    return {};
  }

  if (typeof structuredClone === "function") {
    return structuredClone(metadata as JsonRecord);
  }

  return JSON.parse(JSON.stringify(metadata));
}

const VALID_WALLET_STATUSES: ReadonlySet<WalletStatus> = new Set([
  "active",
  "claimed",
  "used",
  "expired",
]);

function asWalletStatus(value: unknown): WalletStatus | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (VALID_WALLET_STATUSES.has(normalized as WalletStatus)) {
    return normalized as WalletStatus;
  }

  return null;
}

export function normalizeWalletMetadata(metadata: unknown): WalletMetadata {
  return cloneMetadata(metadata);
}

export type WalletCouponStateRecord = {
  couponId: string | null;
  couponCode: string | null;
  status: WalletStatus | null;
  claimedAt: string | null;
  redeemedAt: string | null;
  lastUpdatedAt: string | null;
  qrTokenId: string | null;
  qrTokenExpiresAt: string | null;
};

export function extractCouponState(metadata: unknown): WalletCouponStateRecord {
  const normalized = normalizeWalletMetadata(metadata);
  const { couponState } = ensureCouponState(normalized);
  const record = couponState as Record<string, unknown>;

  return {
    couponId: normalizeString(record.couponId, { convertDate: true }),
    couponCode: normalizeString(record.couponCode, { convertDate: true }),
    status: asWalletStatus(record.status),
    claimedAt: normalizeIsoTimestamp(record.claimedAt) ?? null,
    redeemedAt: normalizeIsoTimestamp(record.redeemedAt) ?? null,
    lastUpdatedAt: normalizeIsoTimestamp(record.lastUpdatedAt) ?? null,
    qrTokenId: normalizeString(record.qrTokenId, { convertDate: true }),
    qrTokenExpiresAt: normalizeIsoTimestamp(record.qrTokenExpiresAt) ?? null,
  } satisfies WalletCouponStateRecord;
}

export async function fetchWallet(
  client: SupabaseClient,
  walletId: string,
): Promise<WalletRow | null> {
  const { data, error } = await client
    .from("wallets")
    .select("id, user_id, status, metadata")
    .eq("id", walletId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function transitionWallet({
  client,
  wallet,
  walletId,
  nextStatus,
  event,
  mutateMetadata,
  eventLimit = MAX_STORED_EVENTS,
  eventContext,
  eventSource,
}: {
  client: SupabaseClient;
  wallet?: WalletRow | null;
  walletId: string;
  nextStatus: WalletStatus;
  event: WalletEvent;
  mutateMetadata?: WalletMetadataMutator;
  eventLimit?: number;
  eventContext?: EventContext;
  eventSource?: string | null;
}) {
  const baseWallet = wallet ?? (await fetchWallet(client, walletId));

  if (!baseWallet) {
    throw new Error(`Wallet ${walletId} not found`);
  }

  const metadataClone = cloneMetadata(baseWallet.metadata);
  const mutatedMetadata = mutateMetadata
    ? mutateMetadata({ ...metadataClone })
    : { ...metadataClone };

  const existingEvents = Array.isArray(mutatedMetadata.events)
    ? [...mutatedMetadata.events]
    : Array.isArray(metadataClone.events)
      ? [...metadataClone.events]
      : [];

  const limit = Math.max(1, eventLimit);
  const nextEvents = [...existingEvents.slice(-(limit - 1)), event];

  mutatedMetadata.events = nextEvents;

  const { data, error } = await client
    .from("wallets")
    .update({
      status: nextStatus,
      metadata: mutatedMetadata,
    })
    .eq("id", baseWallet.id)
    .select("id, user_id, status, metadata")
    .single();

  if (error) {
    throw error;
  }

  try {
    await recordEvent(client, {
      type: event.type,
      at: event.at,
      message: event.message,
      details: event.details,
      source: eventSource ?? null,
      context: {
        walletId: baseWallet.id,
        userId: baseWallet.user_id,
        previousStatus: baseWallet.status,
        nextStatus,
        ...(eventContext ?? {}),
      },
    });
  } catch (eventError) {
    console.error("Failed to record wallet event", eventError);
  }

  console.info(`[wallet:${walletId}] ${event.message}`, {
    event,
    status: nextStatus,
  });

  return data;
}

export function ensureCouponState(metadata: JsonRecord) {
  const couponState = isRecord(metadata.couponState) ? { ...metadata.couponState } : {};

  return {
    metadata,
    couponState,
  };
}
