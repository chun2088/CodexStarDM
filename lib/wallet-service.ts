import type { SupabaseClient } from "@supabase/supabase-js";

type JsonRecord = {
  [key: string]: unknown;
  events?: unknown;
  couponState?: unknown;
};

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

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneMetadata(metadata: unknown): JsonRecord {
  if (!isRecord(metadata)) {
    return {};
  }

  if (typeof structuredClone === "function") {
    return structuredClone(metadata as JsonRecord);
  }

  return JSON.parse(JSON.stringify(metadata));
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
}: {
  client: SupabaseClient;
  wallet?: WalletRow | null;
  walletId: string;
  nextStatus: WalletStatus;
  event: WalletEvent;
  mutateMetadata?: WalletMetadataMutator;
  eventLimit?: number;
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
