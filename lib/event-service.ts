import type { SupabaseClient } from "@supabase/supabase-js";

export type EventContext = {
  userId?: string | null;
  actorId?: string | null;
  storeId?: string | null;
  walletId?: string | null;
  couponId?: string | null;
  qrTokenId?: string | null;
  redemptionId?: string | null;
  subscriptionId?: string | null;
  billingProfileId?: string | null;
  planId?: string | null;
  previousStatus?: string | null;
  nextStatus?: string | null;
  source?: string | null;
  [key: string]: unknown;
};

export type EventRecordInput = {
  type: string;
  at?: string;
  message?: string;
  details?: Record<string, unknown>;
  context?: EventContext;
  source?: string | null;
};

function coerceIsoTimestamp(value?: string) {
  if (typeof value === "string" && value.trim()) {
    const candidate = new Date(value);
    if (!Number.isNaN(candidate.getTime())) {
      return candidate.toISOString();
    }
  }

  return new Date().toISOString();
}

function pruneUndefined(value: unknown): unknown {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (Array.isArray(value)) {
    const next = value
      .map((item) => pruneUndefined(item))
      .filter((item) => item !== undefined);

    return next;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "object") {
    const entries: [string, unknown][] = [];

    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      const sanitized = pruneUndefined(inner);
      if (sanitized !== undefined) {
        entries.push([key, sanitized]);
      }
    }

    if (entries.length === 0) {
      return undefined;
    }

    return Object.fromEntries(entries);
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  return undefined;
}

function sanitizeRecord(record: Record<string, unknown> | null | undefined) {
  if (!record) {
    return undefined;
  }

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record)) {
    const sanitized = pruneUndefined(value);

    if (sanitized !== undefined) {
      result[key] = sanitized;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function buildEventData(input: EventRecordInput) {
  const occurredAt = coerceIsoTimestamp(input.at);
  const data: Record<string, unknown> = {
    occurredAt,
  };

  if (typeof input.message === "string" && input.message.trim()) {
    data.message = input.message;
  }

  const context = sanitizeRecord(input.context ?? undefined);
  if (context) {
    data.context = context;
  }

  const details = sanitizeRecord(input.details ?? undefined);
  if (details) {
    data.details = details;
  }

  const source = typeof input.source === "string" && input.source.trim() ? input.source.trim() : null;
  if (source) {
    data.source = source;
  }

  return data;
}

export async function recordEvent(client: SupabaseClient, input: EventRecordInput) {
  const type = typeof input.type === "string" ? input.type.trim() : "";

  if (!type) {
    throw new Error("Event type is required");
  }

  const payload = {
    type,
    data: buildEventData(input),
  };

  const { error } = await client.from("events").insert(payload);

  if (error) {
    throw error;
  }
}
