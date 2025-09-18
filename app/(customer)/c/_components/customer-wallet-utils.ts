import type { AuthUser } from "@/lib/auth-context";

export function requireWalletAuthentication(
  user: AuthUser | null,
  walletId: string,
  action: string,
): string | null {
  if (!user) {
    return `${action} requires login. Use the login page or a demo account first.`;
  }

  if (!walletId.trim()) {
    return `${action} requires a wallet. Enter a wallet ID and load the wallet first.`;
  }

  return null;
}

export function formatDateTime(value: string | null) {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}
