"use client";

import { StatusBadge } from "@/app/_components/status-badge";
import { ApiError, extractSubscriptionStatus, parseJsonResponse } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

type RedeemResponse = {
  redeemedAt: string;
  coupon: {
    id: string;
    code: string;
  } | null;
  redemptionId: string | null;
};

function isScanEnabled(status: string | null | undefined) {
  return status === "active" || status === "grace";
}

export function MerchantScanView() {
  const { user } = useAuth();
  const [walletId, setWalletId] = useState("");
  const [token, setToken] = useState("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string; subscriptionStatus?: string | null } | null>(
    null,
  );

  const subscriptionStatus = user?.storeSubscriptionStatus ?? null;
  const scanAllowed = isScanEnabled(subscriptionStatus);

  const mutation = useMutation<RedeemResponse, ApiError, { walletId: string; token: string }>({
    mutationFn: async ({ walletId: wallet, token: qrToken }) => {
      const response = await fetch(`/api/wallet/${wallet}/redeem`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: qrToken }),
      });

      return parseJsonResponse<RedeemResponse>(response);
    },
    onSuccess: (data) => {
      setFeedback({
        type: "success",
        message: data.coupon
          ? `Redeemed coupon ${data.coupon.code} at ${new Date(data.redeemedAt).toLocaleString()}`
          : `Token redeemed at ${new Date(data.redeemedAt).toLocaleString()}`,
      });
    },
    onError: (error) => {
      setFeedback({
        type: "error",
        message: error.message,
        subscriptionStatus: extractSubscriptionStatus(error.payload),
      });
    },
  });

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!scanAllowed) {
      setFeedback({ type: "error", message: "Scanning is disabled until the subscription is active." });
      return;
    }

    if (!walletId.trim() || !token.trim()) {
      setFeedback({ type: "error", message: "Wallet ID and QR token are required." });
      return;
    }

    setFeedback(null);
    mutation.mutate({ walletId: walletId.trim(), token: token.trim() });
  };

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900 dark:text-white">Scan and redeem</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Input a wallet ID and QR token to simulate the redemption flow from the merchant device.
          </p>
        </div>
        <StatusBadge status={subscriptionStatus ?? "inactive"} />
      </header>

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Wallet ID</span>
            <input
              type="text"
              value={walletId}
              onChange={(event) => setWalletId(event.target.value)}
              placeholder="wallet-uuid"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-slate-500 dark:focus:ring-slate-600"
              disabled={!scanAllowed}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">QR token</span>
            <input
              type="text"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="single-use token"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-slate-500 dark:focus:ring-slate-600"
              disabled={!scanAllowed}
            />
          </label>
        </div>
        <button
          type="submit"
          className="inline-flex items-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
          disabled={!scanAllowed || mutation.isPending}
        >
          {mutation.isPending ? "Redeeming…" : "Redeem token"}
        </button>
        {feedback ? (
          <div
            className={`rounded-lg border px-3 py-2 text-sm ${
              feedback.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200"
                : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200"
            }`}
          >
            <p>{feedback.message}</p>
            {feedback.subscriptionStatus ? (
              <p className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                Subscription status
                <StatusBadge status={feedback.subscriptionStatus} />
              </p>
            ) : null}
          </div>
        ) : null}
        {!scanAllowed ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Scan mode is locked while the subscription is inactive. Renew billing to regain access.
          </p>
        ) : null}
      </form>
    </section>
  );
}
