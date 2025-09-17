"use client";

import { StatusBadge } from "@/app/_components/status-badge";
import { ApiError, extractSubscriptionStatus, parseJsonResponse } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { useCustomerWallet, type WalletCouponEntry } from "./use-wallet";

const EMPTY_ENTRIES: WalletCouponEntry[] = [];

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

function TokenCountdown({ expiresAt }: { expiresAt?: string | null }) {
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(() => {
    if (!expiresAt) {
      return null;
    }

    const target = new Date(expiresAt);
    if (Number.isNaN(target.getTime())) {
      return null;
    }

    const diff = Math.ceil((target.getTime() - Date.now()) / 1000);
    return diff > 0 ? diff : 0;
  });

  useEffect(() => {
    if (!expiresAt) {
      setRemainingSeconds(null);
      return;
    }

    const target = new Date(expiresAt);
    if (Number.isNaN(target.getTime())) {
      setRemainingSeconds(null);
      return;
    }

    const targetMs = target.getTime();

    const update = () => {
      const diff = Math.ceil((targetMs - Date.now()) / 1000);
      setRemainingSeconds(diff > 0 ? diff : 0);
    };

    update();

    const interval = window.setInterval(update, 1000);
    return () => {
      window.clearInterval(interval);
    };
  }, [expiresAt]);

  if (!expiresAt || remainingSeconds === null) {
    return <span className="text-slate-500 dark:text-slate-400">—</span>;
  }

  if (remainingSeconds <= 0) {
    return <span className="font-semibold text-rose-600 dark:text-rose-300">Expired</span>;
  }

  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;

  return (
    <span className="font-semibold text-slate-900 dark:text-white">
      {minutes}:{seconds.toString().padStart(2, "0")} remaining
    </span>
  );
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

function renderFeedback(feedback: Feedback | null) {
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
}

export function CustomerWalletView() {
  const { user } = useAuth();

  const [walletIdInput, setWalletIdInput] = useState(user?.defaultWalletId ?? "");
  const [walletId, setWalletId] = useState(user?.defaultWalletId ?? "");
  const [claimCouponId, setClaimCouponId] = useState("");
  const [qrTokenInput, setQrTokenInput] = useState("");
  const [selectedCouponId, setSelectedCouponId] = useState<string | null>(null);

  const [claimFeedback, setClaimFeedback] = useState<Feedback | null>(null);
  const [qrFeedback, setQrFeedback] = useState<Feedback | null>(null);
  const [redeemFeedback, setRedeemFeedback] = useState<Feedback | null>(null);

  const [qrResult, setQrResult] = useState<GenerateQrResponse | null>(null);
  const [redeemResult, setRedeemResult] = useState<RedeemResponse | null>(null);

  useEffect(() => {
    if (!walletId && user?.defaultWalletId) {
      setWalletIdInput(user.defaultWalletId);
      setWalletId(user.defaultWalletId);
    }
  }, [user?.defaultWalletId, walletId]);

  useEffect(() => {
    setQrResult(null);
    setRedeemResult(null);
    setClaimFeedback(null);
    setQrFeedback(null);
    setRedeemFeedback(null);
  }, [walletId]);

  const walletQuery = useCustomerWallet(walletId);
  const entries = walletQuery.data?.entries ?? EMPTY_ENTRIES;

  useEffect(() => {
    if (entries.length === 0) {
      setSelectedCouponId(null);
      return;
    }

    setSelectedCouponId((current) => {
      if (current && entries.some((entry) => entry.couponId === current)) {
        return current;
      }

      return entries[0]?.couponId ?? null;
    });
  }, [entries]);

  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.couponId === selectedCouponId) ?? null,
    [entries, selectedCouponId],
  );

  const activeQrToken = walletQuery.data?.activeQrToken ?? null;
  const activeTokenMatchesSelection = Boolean(
    activeQrToken &&
      selectedEntry &&
      activeQrToken.couponId &&
      activeQrToken.couponId === selectedEntry.couponId,
  );

  const ensureAuthenticated = (action: string) => {
    if (!user) {
      return `${action} requires login. Use the login page or a demo account first.`;
    }

    if (!walletId.trim()) {
      return `${action} requires a wallet. Enter a wallet ID and load the wallet first.`;
    }

    return null;
  };

  const claimMutation = useMutation<ClaimResponse, ApiError, { walletId: string; couponId: string }>({
    mutationFn: async ({ walletId: wallet, couponId: coupon }) => {
      const response = await fetch(`/api/coupons/${coupon}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletId: wallet }),
      });

      return parseJsonResponse<ClaimResponse>(response);
    },
    onSuccess: (data) => {
      setClaimFeedback({ type: "success", message: data.message });
      setClaimCouponId("");
      setSelectedCouponId(data.coupon.id);
      setQrResult(null);
      void walletQuery.refetch();
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

  const qrMutation = useMutation<GenerateQrResponse, ApiError, { walletId: string; couponId?: string }>({
    mutationFn: async ({ walletId: wallet, couponId: coupon }) => {
      const response = await fetch(`/api/wallet/${wallet}/qr`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ couponId: coupon ?? null }),
      });

      return parseJsonResponse<GenerateQrResponse>(response);
    },
    onSuccess: (data) => {
      setQrResult(data);
      setQrFeedback({
        type: "success",
        message: "QR token created. Present it to the merchant before the timer expires.",
      });
      void walletQuery.refetch();
    },
    onError: (error) => {
      const subscriptionStatus = extractSubscriptionStatus(error.payload);
      setQrFeedback({ type: "error", message: error.message, subscriptionStatus });
    },
  });

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
          ? `Coupon ${data.coupon.code} redeemed at ${formatDateTime(data.redeemedAt)}`
          : `QR token redeemed at ${formatDateTime(data.redeemedAt)}`,
      });
      setQrResult(null);
      void walletQuery.refetch();
    },
    onError: (error) => {
      const subscriptionStatus = extractSubscriptionStatus(error.payload);
      setRedeemFeedback({ type: "error", message: error.message, subscriptionStatus });
    },
  });

  const handleWalletIdSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = walletIdInput.trim();
    setWalletId(trimmed);
  };

  const handleClaimSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setClaimFeedback(null);

    const authError = ensureAuthenticated("Claiming a coupon");
    if (authError) {
      setClaimFeedback({ type: "error", message: authError });
      return;
    }

    const coupon = claimCouponId.trim();
    if (!coupon) {
      setClaimFeedback({ type: "error", message: "couponId is required" });
      return;
    }

    claimMutation.mutate({ walletId: walletId.trim(), couponId: coupon });
  };

  const handleClaimSelected = () => {
    setClaimFeedback(null);

    const authError = ensureAuthenticated("Claiming a coupon");
    if (authError) {
      setClaimFeedback({ type: "error", message: authError });
      return;
    }

    if (!selectedEntry?.couponId) {
      setClaimFeedback({ type: "error", message: "Select a coupon before claiming." });
      return;
    }

    claimMutation.mutate({ walletId: walletId.trim(), couponId: selectedEntry.couponId });
  };

  const handleGenerateQr = () => {
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

    if (!selectedEntry?.couponId) {
      setQrFeedback({ type: "error", message: "Select a coupon before generating a QR token." });
      return;
    }

    qrMutation.mutate({ walletId: walletId.trim(), couponId: selectedEntry.couponId });
  };

  const handleRedeemSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setRedeemFeedback(null);

    if (!walletId.trim() || !qrTokenInput.trim()) {
      setRedeemFeedback({ type: "error", message: "walletId and QR token are required" });
      return;
    }

    redeemMutation.mutate({ walletId: walletId.trim(), token: qrTokenInput.trim() });
  };

  return (
    <section className="space-y-8">
      <header>
        <h2 className="text-3xl font-semibold text-slate-900 dark:text-white">Wallet actions</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Manage coupon claims, QR tokens, and redemption events. Merchant subscription status determines access to each feature.
        </p>
      </header>

      <div className="space-y-6">
        <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Wallet overview</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Load your wallet, claim coupons by ID, and review their current state. Select a coupon from the list to take action.
            </p>
          </div>

          <form onSubmit={handleWalletIdSubmit} className="flex flex-col gap-3 sm:flex-row">
            <label className="grow space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300">Wallet ID</span>
              <input
                type="text"
                value={walletIdInput}
                onChange={(event) => setWalletIdInput(event.target.value)}
                placeholder="wallet-uuid"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-slate-500 dark:focus:ring-slate-600"
              />
            </label>
            <div className="flex items-end gap-3">
              <button
                type="submit"
                className="inline-flex items-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
              >
                Load wallet
              </button>
              <button
                type="button"
                onClick={() => walletQuery.refetch()}
                className="inline-flex items-center rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-400 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:text-white"
                disabled={!walletId.trim() || walletQuery.isFetching}
              >
                {walletQuery.isFetching ? "Refreshing…" : "Refresh"}
              </button>
            </div>
          </form>

          {walletQuery.isLoading ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">Loading wallet…</p>
          ) : walletQuery.error ? (
            <p className="text-sm text-rose-600 dark:text-rose-300">{(walletQuery.error as Error).message}</p>
          ) : walletQuery.data ? (
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
              <span className="text-slate-500 dark:text-slate-400">Wallet status</span>
              <StatusBadge status={walletQuery.data.wallet.status} />
            </div>
          ) : null}

          <form onSubmit={handleClaimSubmit} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/50">
            <div className="text-sm text-slate-600 dark:text-slate-300">
              <p className="font-medium text-slate-900 dark:text-white">Claim coupon by ID</p>
              <p>Use this form to add a coupon to your wallet even if it is not listed yet.</p>
            </div>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300">Coupon ID</span>
              <input
                type="text"
                value={claimCouponId}
                onChange={(event) => setClaimCouponId(event.target.value)}
                placeholder="coupon-uuid"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-slate-500 dark:focus:ring-slate-600"
              />
            </label>
            <button
              type="submit"
              className="inline-flex items-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
              disabled={claimMutation.isPending}
            >
              {claimMutation.isPending ? "Claiming…" : "Claim coupon"}
            </button>
            {renderFeedback(claimFeedback)}
          </form>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Wallet coupons
              </h4>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {entries.length} {entries.length === 1 ? "entry" : "entries"}
              </span>
            </div>
            {entries.length === 0 ? (
              <p className="text-sm text-slate-600 dark:text-slate-300">
                No coupons found in this wallet yet. Claim a coupon to get started.
              </p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {entries.map((entry) => {
                  const isSelected = entry.couponId === selectedCouponId;
                  return (
                    <button
                      type="button"
                      key={entry.couponId}
                      onClick={() => setSelectedCouponId(entry.couponId)}
                      className={`w-full rounded-xl border px-4 py-4 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:focus-visible:ring-slate-600 ${
                        isSelected
                          ? "border-slate-400 bg-slate-100 shadow-sm dark:border-slate-600 dark:bg-slate-900/60"
                          : "border-slate-200 hover:border-slate-400 hover:shadow-sm dark:border-slate-800 dark:hover:border-slate-600"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            {entry.couponCode ?? entry.couponId}
                          </p>
                          <p className="mt-1 text-sm font-medium text-slate-900 dark:text-white">
                            {entry.couponName ?? "Untitled coupon"}
                          </p>
                        </div>
                        <StatusBadge status={entry.status} />
                      </div>
                      <dl className="mt-3 grid gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <div className="flex items-center justify-between gap-2">
                          <dt>Last update</dt>
                          <dd>{formatDateTime(entry.lastUpdatedAt)}</dd>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <dt>Claimed</dt>
                          <dd>{formatDateTime(entry.claimedAt)}</dd>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <dt>Redeemed</dt>
                          <dd>{formatDateTime(entry.redeemedAt)}</dd>
                        </div>
                      </dl>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Coupon actions</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Select a coupon to view its details, re-claim it, or generate a fresh QR token. Active tokens expire after 120 seconds.
            </p>
          </div>

          {selectedEntry ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/50">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      {selectedEntry.couponCode ?? selectedEntry.couponId}
                    </p>
                    <h4 className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                      {selectedEntry.couponName ?? "Untitled coupon"}
                    </h4>
                    {selectedEntry.couponDescription ? (
                      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                        {selectedEntry.couponDescription}
                      </p>
                    ) : null}
                  </div>
                  <StatusBadge status={selectedEntry.status} />
                </div>
                <dl className="mt-4 grid gap-2 text-xs text-slate-500 dark:text-slate-400 sm:grid-cols-2">
                  <div className="flex items-center justify-between gap-2">
                    <dt>Claimed</dt>
                    <dd>{formatDateTime(selectedEntry.claimedAt)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt>Last update</dt>
                    <dd>{formatDateTime(selectedEntry.lastUpdatedAt)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt>Redeemed</dt>
                    <dd>{formatDateTime(selectedEntry.redeemedAt)}</dd>
                  </div>
                </dl>
                {activeTokenMatchesSelection ? (
                  <div className="mt-4 rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200">
                    <p className="flex items-center justify-between gap-2">
                      <span>Active QR token</span>
                      <TokenCountdown expiresAt={activeQrToken?.expiresAt} />
                    </p>
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleClaimSelected}
                  className="inline-flex items-center rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:text-white"
                  disabled={claimMutation.isPending}
                >
                  {claimMutation.isPending ? "Claiming…" : "Claim selected coupon"}
                </button>
                <button
                  type="button"
                  onClick={handleGenerateQr}
                  className="inline-flex items-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                  disabled={qrMutation.isPending}
                >
                  {qrMutation.isPending ? "Generating…" : "Generate QR token"}
                </button>
              </div>

              {qrResult ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-200">
                  <p>
                    <span className="font-semibold">Token:</span> {qrResult.token}
                  </p>
                  <p className="mt-2 flex items-center gap-2">
                    <span className="font-semibold">Expires in:</span>
                    <TokenCountdown expiresAt={qrResult.expiresAt} />
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Expires at {formatDateTime(qrResult.expiresAt)}
                  </p>
                </div>
              ) : null}

              {renderFeedback(qrFeedback)}
            </div>
          ) : (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Select a coupon from the wallet list to view details and generate QR tokens.
            </p>
          )}
        </div>

        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Redeem QR token</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Merchants scan the QR token to redeem a coupon. Use this form for manual testing when a merchant device is unavailable.
            </p>
          </div>
          <form onSubmit={handleRedeemSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="font-medium text-slate-700 dark:text-slate-300">Wallet ID</span>
                <input
                  type="text"
                  value={walletId}
                  readOnly
                  className="w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-slate-500 dark:focus:ring-slate-600"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium text-slate-700 dark:text-slate-300">QR token</span>
                <input
                  type="text"
                  value={qrTokenInput}
                  onChange={(event) => setQrTokenInput(event.target.value)}
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
          </form>
          {redeemResult ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-200">
              <p>
                <span className="font-semibold">Redeemed at:</span> {formatDateTime(redeemResult.redeemedAt)}
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
        </div>
      </div>
    </section>
  );
}
