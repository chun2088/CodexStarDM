import { parseJsonResponse } from "@/lib/api-client";
import type { WalletStatus } from "@/lib/wallet-service";
import { useQuery } from "@tanstack/react-query";

export type WalletCouponEntry = {
  couponId: string;
  couponCode: string | null;
  couponName: string | null;
  couponDescription: string | null;
  status: WalletStatus;
  claimedAt: string | null;
  redeemedAt: string | null;
  lastUpdatedAt: string | null;
  redemptionId: string | null;
  qrTokenId: string | null;
  qrTokenExpiresAt: string | null;
};

export type WalletSummary = {
  id: string;
  status: WalletStatus;
};

export type ActiveQrToken = {
  id: string;
  couponId: string | null;
  couponCode: string | null;
  expiresAt: string;
  metadata: Record<string, unknown> | null;
};

export type CustomerWalletPayload = {
  wallet: WalletSummary;
  entries: WalletCouponEntry[];
  activeQrToken: ActiveQrToken | null;
};

async function fetchWalletPayload(walletId: string) {
  const response = await fetch(`/api/wallet/${walletId}`, { cache: "no-store" });
  return parseJsonResponse<CustomerWalletPayload>(response);
}

export function useCustomerWallet(walletId?: string | null) {
  const normalizedId = typeof walletId === "string" ? walletId.trim() : "";

  return useQuery<CustomerWalletPayload>({
    queryKey: ["customer", "wallet", normalizedId],
    enabled: Boolean(normalizedId),
    queryFn: async () => {
      const payload = await fetchWalletPayload(normalizedId);

      return {
        wallet: payload.wallet,
        entries: Array.isArray(payload.entries) ? payload.entries : [],
        activeQrToken: payload.activeQrToken ?? null,
      } satisfies CustomerWalletPayload;
    },
  });
}

