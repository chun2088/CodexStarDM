import { createHash, randomBytes } from "node:crypto";

const URL_SAFE_REPLACEMENTS: Record<string, string> = {
  "+": "-",
  "/": "_",
  "=": "",
};

function toUrlSafeBase64(value: string) {
  return value.replace(/[+/=]/g, (character) => URL_SAFE_REPLACEMENTS[character] ?? "");
}

export function generateQrTokenValue(size = 32) {
  const raw = randomBytes(size).toString("base64");
  return toUrlSafeBase64(raw);
}

export function hashQrToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export const QR_TOKEN_TTL_SECONDS = 120;
