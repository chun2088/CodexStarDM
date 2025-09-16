import { createHash } from "node:crypto";

export const MAGIC_LINK_TOKEN_TTL_MS = 15 * 60 * 1000;

type MagicLinkMetadata = {
  email: string;
  redirectTo: string | null;
  expiresAt: number;
};

type MagicLinkTokenStore = Map<string, MagicLinkMetadata>;

const globalForTokens = globalThis as unknown as {
  __magicLinkTokenStore?: MagicLinkTokenStore;
};

const tokenStore: MagicLinkTokenStore =
  globalForTokens.__magicLinkTokenStore ?? new Map<string, MagicLinkMetadata>();

if (!globalForTokens.__magicLinkTokenStore) {
  globalForTokens.__magicLinkTokenStore = tokenStore;
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function pruneExpiredTokens(now = Date.now()) {
  for (const [key, metadata] of tokenStore) {
    if (metadata.expiresAt <= now) {
      tokenStore.delete(key);
    }
  }
}

export function storeMagicLinkToken(
  token: string,
  { email, redirectTo }: { email: string; redirectTo?: string | null },
  ttlMs = MAGIC_LINK_TOKEN_TTL_MS,
) {
  pruneExpiredTokens();

  const hashedToken = hashToken(token);

  tokenStore.set(hashedToken, {
    email,
    redirectTo: redirectTo ?? null,
    expiresAt: Date.now() + ttlMs,
  });

  return hashedToken;
}

export type ConsumedMagicLinkToken = {
  email: string;
  redirectTo?: string;
};

export function consumeMagicLinkToken(token: string): ConsumedMagicLinkToken | null {
  pruneExpiredTokens();

  const hashedToken = hashToken(token);
  const metadata = tokenStore.get(hashedToken);

  if (!metadata) {
    return null;
  }

  tokenStore.delete(hashedToken);

  if (metadata.expiresAt <= Date.now()) {
    return null;
  }

  return {
    email: metadata.email,
    redirectTo: metadata.redirectTo ?? undefined,
  };
}
