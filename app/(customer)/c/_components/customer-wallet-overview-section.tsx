"use client";

import { StatusBadge } from "@/app/_components/status-badge";
import type { WalletStatus } from "@/lib/wallet-service";
import type { FormEvent } from "react";

import type { Feedback } from "./customer-wallet-feedback";
import { FeedbackAlert } from "./customer-wallet-feedback";
import { formatDateTime } from "./customer-wallet-utils";
import type { WalletCouponEntry } from "./use-wallet";

type WalletOverviewSectionProps = {
  walletId: string;
  walletIdInput: string;
  onWalletIdInputChange: (value: string) => void;
  onWalletSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onRefreshWallet: () => void;
  isFetchingWallet: boolean;
  isLoadingWallet: boolean;
  walletError: unknown;
  walletStatus: WalletStatus | null;
  claimCouponId: string;
  onClaimCouponIdChange: (value: string) => void;
  onClaimSubmit: (event: FormEvent<HTMLFormElement>) => void;
  claimPending: boolean;
  claimFeedback: Feedback | null;
  entries: WalletCouponEntry[];
  selectedCouponId: string | null;
  onSelectCoupon: (couponId: string) => void;
};

export function WalletOverviewSection({
  walletId,
  walletIdInput,
  onWalletIdInputChange,
  onWalletSubmit,
  onRefreshWallet,
  isFetchingWallet,
  isLoadingWallet,
  walletError,
  walletStatus,
  claimCouponId,
  onClaimCouponIdChange,
  onClaimSubmit,
  claimPending,
  claimFeedback,
  entries,
  selectedCouponId,
  onSelectCoupon,
}: WalletOverviewSectionProps) {
  const refreshDisabled = !walletId.trim() || isFetchingWallet;
  const errorMessage = walletError
    ? walletError instanceof Error
      ? walletError.message
      : String(walletError)
    : null;

  return (
    <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
      <div>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Wallet overview</h3>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Load your wallet, claim coupons by ID, and review their current state. Select a coupon from the list to take action.
        </p>
      </div>

      <form onSubmit={onWalletSubmit} className="flex flex-col gap-3 sm:flex-row">
        <label className="grow space-y-1 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">Wallet ID</span>
          <input
            type="text"
            value={walletIdInput}
            onChange={(event) => onWalletIdInputChange(event.target.value)}
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
            onClick={onRefreshWallet}
            className="inline-flex items-center rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-400 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:text-white"
            disabled={refreshDisabled}
          >
            {isFetchingWallet ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </form>

      {isLoadingWallet ? (
        <p className="text-sm text-slate-600 dark:text-slate-300">Loading wallet…</p>
      ) : errorMessage ? (
        <p className="text-sm text-rose-600 dark:text-rose-300">{errorMessage}</p>
      ) : walletStatus ? (
        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
          <span className="text-slate-500 dark:text-slate-400">Wallet status</span>
          <StatusBadge status={walletStatus} />
        </div>
      ) : null}

      <form onSubmit={onClaimSubmit} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/50">
        <div className="text-sm text-slate-600 dark:text-slate-300">
          <p className="font-medium text-slate-900 dark:text-white">Claim coupon by ID</p>
          <p>Use this form to add a coupon to your wallet even if it is not listed yet.</p>
        </div>
        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">Coupon ID</span>
          <input
            type="text"
            value={claimCouponId}
            onChange={(event) => onClaimCouponIdChange(event.target.value)}
            placeholder="coupon-uuid"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-slate-500 dark:focus:ring-slate-600"
          />
        </label>
        <button
          type="submit"
          className="inline-flex items-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
          disabled={claimPending}
        >
          {claimPending ? "Claiming…" : "Claim coupon"}
        </button>
        <FeedbackAlert feedback={claimFeedback} />
      </form>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Wallet coupons</h4>
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
                  onClick={() => onSelectCoupon(entry.couponId)}
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
  );
}
