import { createHash } from "node:crypto";

import type { PostgrestError } from "@supabase/supabase-js";

import { getSupabaseAdminClient } from "./supabase-client";

export const MAGIC_LINK_TOKEN_TTL_MS = 15 * 60 * 1000;

const TABLE_NAME = "magic_link_tokens";
const MAX_TOKEN_INSERT_ATTEMPTS = 3;

export type MagicLinkTokenContext = Record<string, unknown>;

export type StoredMagicLinkToken = {
  id: string;
  hashedToken: string;
  expiresAt: string;
};

export type ConsumedMagicLinkToken = {
  id: string;
  email: string;
  redirectTo?: string;
  metadata?: Record<string, unknown> | null;
};

type StoreOptions = {
  email: string;
  redirectTo?: string | null;
  context?: MagicLinkTokenContext | null;
};

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function sanitizeRedirect(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function sanitizeMetadata(value: Record<string, unknown> | null | undefined) {
  if (!value) {
    return {};
  }

  const sanitized: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined) {
      continue;
    }

    if (
      entry === null ||
      typeof entry === "string" ||
      typeof entry === "number" ||
      typeof entry === "boolean"
    ) {
      sanitized[key] = entry;
      continue;
    }

    if (entry instanceof Date) {
      sanitized[key] = entry.toISOString();
      continue;
    }

    if (Array.isArray(entry)) {
      const items = entry
        .map((item) => {
          if (
            item === null ||
            typeof item === "string" ||
            typeof item === "number" ||
            typeof item === "boolean"
          ) {
            return item;
          }

          if (item instanceof Date) {
            return item.toISOString();
          }

          if (typeof item === "object" && item) {
            const nested = sanitizeMetadata(item as Record<string, unknown>);
            return Object.keys(nested).length > 0 ? nested : undefined;
          }

          return undefined;
        })
        .filter((item) => item !== undefined);

      if (items.length > 0) {
        sanitized[key] = items;
      }

      continue;
    }

    if (typeof entry === "object") {
      const nested = sanitizeMetadata(entry as Record<string, unknown>);
      if (Object.keys(nested).length > 0) {
        sanitized[key] = nested;
      }
    }
  }

  return sanitized;
}

function isUniqueViolation(error: PostgrestError | null | undefined) {
  return !!error && error.code === "23505";
}

function isNoRowError(error: PostgrestError | null | undefined) {
  return !!error && (error.code === "PGRST116" || error.code === "PGRST103");
}

export async function storeMagicLinkToken(
  token: string,
  { email, redirectTo, context }: StoreOptions,
  ttlMs = MAGIC_LINK_TOKEN_TTL_MS,
): Promise<StoredMagicLinkToken> {
  const supabaseClient = getSupabaseAdminClient();
  const hashedToken = hashToken(token);
  const expiresAtIso = new Date(Date.now() + ttlMs).toISOString();
  const sanitizedContext = sanitizeMetadata(context ?? null);
  const normalizedRedirectTo = sanitizeRedirect(redirectTo ?? null);

  let attempt = 0;

  while (attempt < MAX_TOKEN_INSERT_ATTEMPTS) {
    attempt += 1;

    const { data, error } = await supabaseClient
      .from(TABLE_NAME)
      .insert({
        token_hash: hashedToken,
        email,
        redirect_to: normalizedRedirectTo,
        metadata: sanitizedContext,
        expires_at: expiresAtIso,
      })
      .select("id, token_hash, expires_at")
      .single();

    if (!error && data) {
      return {
        id: data.id,
        hashedToken,
        expiresAt: data.expires_at,
      };
    }

    if (isUniqueViolation(error) && attempt < MAX_TOKEN_INSERT_ATTEMPTS) {
      continue;
    }

    throw error ?? new Error("Failed to store magic link token");
  }

  throw new Error("Unable to store magic link token");
}

export async function consumeMagicLinkToken(
  token: string,
): Promise<ConsumedMagicLinkToken | null> {
  const supabaseClient = getSupabaseAdminClient();
  const hashedToken = hashToken(token);
  const nowIso = new Date().toISOString();

  const { data, error } = await supabaseClient
    .from(TABLE_NAME)
    .update({ consumed_at: nowIso })
    .eq("token_hash", hashedToken)
    .is("consumed_at", null)
    .gt("expires_at", nowIso)
    .select("id, email, redirect_to, metadata")
    .single();

  if (error) {
    if (isNoRowError(error)) {
      return null;
    }

    throw error;
  }

  if (!data) {
    return null;
  }

  const redirectTo = sanitizeRedirect(data.redirect_to ?? undefined);
  const metadata = data.metadata && typeof data.metadata === "object" ? (data.metadata as Record<string, unknown>) : null;

  return {
    id: data.id,
    email: data.email,
    redirectTo: redirectTo ?? undefined,
    metadata,
  };
}

export async function deleteMagicLinkTokenById(id: string) {
  const supabaseClient = getSupabaseAdminClient();

  const { error } = await supabaseClient.from(TABLE_NAME).delete().eq("id", id);

  if (error) {
    throw error;
  }
}
