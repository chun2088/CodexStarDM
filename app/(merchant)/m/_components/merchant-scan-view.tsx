"use client";

import { StatusBadge } from "@/app/_components/status-badge";
import { ApiError, extractSubscriptionStatus, parseJsonResponse } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";

type ScanVerifyResponse = {
  result: "redeemed" | "expired" | "duplicate" | "mismatched_store" | "not_found" | "invalid";
  message: string;
  error?: string;
  redeemedAt?: string;
  redemptionId?: string | null;
  coupon?: {
    id: string;
    code: string | null;
  } | null;
  wallet?: {
    id: string;
    status: string;
    metadata: Record<string, unknown> | null;
  } | null;
  walletId?: string | null;
  storeId?: string | null;
  expectedStoreId?: string | null;
  expiresAt?: string | null;
};

type ScanFeedback =
  | null
  | {
      type: "success" | "error";
      message: string;
      detail?: string;
      subscriptionStatus?: string | null;
    };

function isScanEnabled(status: string | null | undefined) {
  return status === "active" || status === "grace";
}

export function MerchantScanView() {
  const { user } = useAuth();
  const [token, setToken] = useState("");
  const [feedback, setFeedback] = useState<ScanFeedback>(null);

  const subscriptionStatus = user?.storeSubscriptionStatus ?? null;
  const scanAllowed = isScanEnabled(subscriptionStatus);
  const formattedToken = useMemo(() => token.trim(), [token]);

  const mutation = useMutation<ScanVerifyResponse, ApiError, { token: string }>({
    mutationFn: async ({ token: qrToken }) => {
      const response = await fetch(`/api/scan/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: qrToken }),
      });

      return parseJsonResponse<ScanVerifyResponse>(response);
    },
    onSuccess: (data) => {
      const detailParts: string[] = [];

      if (data.redeemedAt) {
        detailParts.push(`Redeemed at ${new Date(data.redeemedAt).toLocaleString()}`);
      }

      if (data.coupon?.code) {
        detailParts.push(`Coupon code: ${data.coupon.code}`);
      }

      if (data.redemptionId) {
        detailParts.push(`Redemption ID: ${data.redemptionId}`);
      }

      if (data.wallet?.id) {
        detailParts.push(`Wallet: ${data.wallet.id}`);
      }

      setFeedback({
        type: "success",
        message: data.message,
        detail: detailParts.length > 0 ? detailParts.join(" • ") : undefined,
      });
    },
    onError: (error) => {
      let message = error.message;
      let detail: string | undefined;

      const payload =
        error.payload && typeof error.payload === "object"
          ? (error.payload as Partial<ScanVerifyResponse> & { error?: string })
          : null;

      if (payload) {
        if (typeof payload.message === "string" && payload.message.trim()) {
          message = payload.message;
        } else if (typeof payload.error === "string" && payload.error.trim()) {
          message = payload.error;
        }

        if (payload.result === "expired" && payload.expiresAt) {
          detail = `Expired at ${new Date(payload.expiresAt).toLocaleString()}`;
        } else if (payload.result === "duplicate" && payload.redeemedAt) {
          detail = `Already redeemed at ${new Date(payload.redeemedAt).toLocaleString()}`;
        } else if (payload.result === "mismatched_store") {
          const mismatchDetail = [
            payload.storeId ? `Token store: ${payload.storeId}` : null,
            payload.expectedStoreId ? `Your store: ${payload.expectedStoreId}` : null,
          ]
            .filter(Boolean)
            .join(" • ");

          detail = mismatchDetail || undefined;
        } else if (payload.result === "invalid" && payload.walletId) {
          detail = `Wallet: ${payload.walletId}`;
        }
      }

      setFeedback({
        type: "error",
        message,
        detail,
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

    if (!formattedToken) {
      setFeedback({ type: "error", message: "QR token is required." });
      return;
    }

    setFeedback(null);
    mutation.mutate({ token: formattedToken });
  };

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900 dark:text-white">Scan and redeem</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Input a QR token to simulate the scan-and-redeem flow from the merchant device.
          </p>
        </div>
        <StatusBadge status={subscriptionStatus ?? "inactive"} />
      </header>

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70"
      >
        <label className="block space-y-1 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">QR token</span>
          <input
            type="text"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="single-use token"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-slate-500 dark:focus:ring-slate-600"
            disabled={!scanAllowed || mutation.isPending}
          />
        </label>
        <button
          type="submit"
          className="inline-flex items-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
          disabled={!scanAllowed || mutation.isPending}
        >
          {mutation.isPending ? "Verifying…" : "Verify token"}
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
            {feedback.detail ? (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{feedback.detail}</p>
            ) : null}
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
