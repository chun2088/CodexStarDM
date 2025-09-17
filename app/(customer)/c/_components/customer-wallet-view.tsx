"use client";

import { StatusBadge } from "@/app/_components/status-badge";
import { ApiError, extractSubscriptionStatus, parseJsonResponse } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

type ClaimResponse = {
  message: string;
  coupon: {
    id: string;
    code: string;
    name: string | null;
    description: string | null;
  };
  wallet: {
    id: string;
    status: string;
  };
};

type GenerateQrResponse = {
  token: string;
  expiresAt: string;
  wallet: {
    id: string;
    status: string;
  };
};

type RedeemResponse = {
  redeemedAt: string;
  coupon: {
    id: string;
    code: string;
  } | null;
  redemptionId: string | null;
  wallet: {
    id: string;
    status: string;
  };
};

type Feedback = {
  type: "success" | "error";
  message: string;
  subscriptionStatus?: string | null;
};

function formatExpiry(expiresAt: string) {
  return new Date(expiresAt).toLocaleString();
}

export function CustomerWalletView() {
  const { user } = useAuth();

  const [walletId, setWalletId] = useState(user?.defaultWalletId ?? "");
  const [couponId, setCouponId] = useState("");
  const [qrCouponId, setQrCouponId] = useState("");
  const [qrToken, setQrToken] = useState("");

  const [claimFeedback, setClaimFeedback] = useState<Feedback | null>(null);
  const [qrFeedback, setQrFeedback] = useState<Feedback | null>(null);
  const [redeemFeedback, setRedeemFeedback] = useState<Feedback | null>(null);

  const [qrResult, setQrResult] = useState<GenerateQrResponse | null>(null);
  const [redeemResult, setRedeemResult] = useState<RedeemResponse | null>(null);

  const claimMutation = useMutation<ClaimResponse, ApiError, { userId: string; walletId: string; couponId: string }>({
    mutationFn: async ({ userId, walletId: wallet, couponId: coupon }) => {
      const response = await fetch(`/api/coupons/${coupon}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, walletId: wallet }),
      });

      return parseJsonResponse<ClaimResponse>(response);
    },
    onSuccess: (data) => {
      setClaimFeedback({ type: "success", message: data.message });
    },
    onError: (error) => {
      const subscriptionStatus = extractSubscriptionStatus(error.payload);
      setClaimFeedback({
        type: "error",
        message: error.message,
        subscriptionStatus,
      });
    },
  });

  const qrMutation = useMutation<GenerateQrResponse, ApiError, { userId: string; walletId: string; couponId?: string }>(
    {
      mutationFn: async ({ userId, walletId: wallet, couponId: coupon }) => {
        const response = await fetch(`/api/wallet/${wallet}/qr`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, couponId: coupon ?? null }),
        });

        return parseJsonResponse<GenerateQrResponse>(response);
      },
      onSuccess: (data) => {
        setQrResult(data);
        setQrFeedback({
          type: "success",
          message: `QR token created and expires at ${formatExpiry(data.expiresAt)}`,
        });
      },
      onError: (error) => {
        const subscriptionStatus = extractSubscriptionStatus(error.payload);
        setQrFeedback({ type: "error", message: error.message, subscriptionStatus });
      },
    },
  );

  const redeemMutation = useMutation<
    RedeemResponse,
    ApiError,
    { walletId: string; token: string }
  >({
    mutationFn: async ({ walletId: wallet, token }) => {
      const response = await fetch(`/api/wallet/${wallet}/redeem`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      return parseJsonResponse<RedeemResponse>(response);
    },
    onSuccess: (data) => {
      setRedeemResult(data);
      setRedeemFeedback({
        type: "success",
        message: data.coupon
          ? `Coupon ${data.coupon.code} redeemed at ${new Date(data.redeemedAt).toLocaleString()}`
          : `QR token redeemed at ${new Date(data.redeemedAt).toLocaleString()}`,
      });
    },
    onError: (error) => {
      const subscriptionStatus = extractSubscriptionStatus(error.payload);
      setRedeemFeedback({ type: "error", message: error.message, subscriptionStatus });
    },
  });

  const ensureAuthenticated = (action: string) => {
    if (!user) {
      return `${action} requires login. Use the login page or a demo account first.`;
    }

    return null;
  };

  const handleClaimSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setClaimFeedback(null);

    const authError = ensureAuthenticated("Claiming a coupon");
    if (authError) {
      setClaimFeedback({ type: "error", message: authError });
      return;
    }

    if (!walletId.trim() || !couponId.trim()) {
      setClaimFeedback({ type: "error", message: "walletId and couponId are required" });
      return;
    }

    claimMutation.mutate({ userId: user!.id, walletId: walletId.trim(), couponId: couponId.trim() });
  };

  const handleQrSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setQrFeedback(null);

    const authError = ensureAuthenticated("Generating a QR token");
    if (authError) {
      setQrFeedback({ type: "error", message: authError });
      return;
    }

    if (!walletId.trim()) {
      setQrFeedback({ type: "error", message: "walletId is required" });
      return;
    }

    qrMutation.mutate({
      userId: user!.id,
      walletId: walletId.trim(),
      couponId: qrCouponId.trim() || undefined,
    });
  };

  const handleRedeemSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setRedeemFeedback(null);

    if (!walletId.trim() || !qrToken.trim()) {
      setRedeemFeedback({ type: "error", message: "walletId and QR token are required" });
      return;
    }

    redeemMutation.mutate({ walletId: walletId.trim(), token: qrToken.trim() });
  };

  const renderFeedback = (feedback: Feedback | null) => {
    if (!feedback) {
      return null;
    }

    return (
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
    );
  };

  return (
    <section className="space-y-8">
      <header>
        <h2 className="text-3xl font-semibold text-slate-900 dark:text-white">Wallet actions</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Manage coupon claims, QR tokens, and redemption events. Merchant subscription status determines access to each
          feature.
        </p>
      </header>

      <div className="space-y-6">
        <form
          onSubmit={handleClaimSubmit}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70"
        >
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Claim coupon</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Claiming a coupon stores it in the wallet and invalidates any previous QR tokens.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300">Wallet ID</span>
              <input
                type="text"
                value={walletId}
                onChange={(event) => setWalletId(event.target.value)}
                placeholder="wallet-uuid"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-slate-500 dark:focus:ring-slate-600"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300">Coupon ID</span>
              <input
                type="text"
                value={couponId}
                onChange={(event) => setCouponId(event.target.value)}
                placeholder="coupon-uuid"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-slate-500 dark:focus:ring-slate-600"
              />
            </label>
          </div>
          <button
            type="submit"
            className="inline-flex items-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
            disabled={claimMutation.isPending}
          >
            {claimMutation.isPending ? "Claiming…" : "Claim coupon"}
          </button>
          {renderFeedback(claimFeedback)}
        </form>

        <form
          onSubmit={handleQrSubmit}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70"
        >
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Generate QR token</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              QR tokens expire after 120 seconds. They are single-use and require the wallet owner to be logged in.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300">Wallet ID</span>
              <input
                type="text"
                value={walletId}
                onChange={(event) => setWalletId(event.target.value)}
                placeholder="wallet-uuid"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-slate-500 dark:focus:ring-slate-600"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300">Coupon ID (optional)</span>
              <input
                type="text"
                value={qrCouponId}
                onChange={(event) => setQrCouponId(event.target.value)}
                placeholder="coupon-uuid"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-slate-500 dark:focus:ring-slate-600"
              />
            </label>
          </div>
          <button
            type="submit"
            className="inline-flex items-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
            disabled={qrMutation.isPending}
          >
            {qrMutation.isPending ? "Generating…" : "Create QR token"}
          </button>
          {qrResult ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
              <p>
                <span className="font-semibold">Token:</span> {qrResult.token}
              </p>
              <p>
                <span className="font-semibold">Expires at:</span> {formatExpiry(qrResult.expiresAt)}
              </p>
            </div>
          ) : null}
          {renderFeedback(qrFeedback)}
        </form>

        <form
          onSubmit={handleRedeemSubmit}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70"
        >
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Redeem QR token</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Merchants scan the QR token to redeem a coupon. Redemption succeeds only for active subscriptions.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300">Wallet ID</span>
              <input
                type="text"
                value={walletId}
                onChange={(event) => setWalletId(event.target.value)}
                placeholder="wallet-uuid"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-slate-500 dark:focus:ring-slate-600"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300">QR token</span>
              <input
                type="text"
                value={qrToken}
                onChange={(event) => setQrToken(event.target.value)}
                placeholder="single-use token"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-slate-500 dark:focus:ring-slate-600"
              />
            </label>
          </div>
          <button
            type="submit"
            className="inline-flex items-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
            disabled={redeemMutation.isPending}
          >
            {redeemMutation.isPending ? "Redeeming…" : "Redeem token"}
          </button>
          {redeemResult ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
              <p>
                <span className="font-semibold">Redeemed at:</span> {new Date(redeemResult.redeemedAt).toLocaleString()}
              </p>
              {redeemResult.coupon ? (
                <p>
                  <span className="font-semibold">Coupon:</span> {redeemResult.coupon.code}
                </p>
              ) : null}
              {redeemResult.redemptionId ? (
                <p>
                  <span className="font-semibold">Redemption ID:</span> {redeemResult.redemptionId}
                </p>
              ) : null}
            </div>
          ) : null}
          {renderFeedback(redeemFeedback)}
        </form>
      </div>
    </section>
  );
}
