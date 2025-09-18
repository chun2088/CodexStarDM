"use client";

import { FeedbackAlert } from "./customer-wallet-feedback";
import { formatDateTime } from "./customer-wallet-utils";
import type { RedeemResponse } from "./use-customer-wallet-controls";
import type { Feedback } from "./customer-wallet-feedback";
import type { FormEvent } from "react";

type RedeemSectionProps = {
  walletId: string;
  qrTokenInput: string;
  onQrTokenInputChange: (value: string) => void;
  onRedeemSubmit: (event: FormEvent<HTMLFormElement>) => void;
  redeemPending: boolean;
  redeemResult: RedeemResponse | null;
  redeemFeedback: Feedback | null;
};

export function RedeemSection({
  walletId,
  qrTokenInput,
  onQrTokenInputChange,
  onRedeemSubmit,
  redeemPending,
  redeemResult,
  redeemFeedback,
}: RedeemSectionProps) {
  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
      <div>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Redeem QR token</h3>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Merchants scan the QR token to redeem a coupon. Use this form for manual testing when a merchant device is unavailable.
        </p>
      </div>
      <form onSubmit={onRedeemSubmit} className="space-y-4">
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
              onChange={(event) => onQrTokenInputChange(event.target.value)}
              placeholder="single-use token"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-slate-500 dark:focus:ring-slate-600"
            />
          </label>
        </div>
        <button
          type="submit"
          className="inline-flex items-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
          disabled={redeemPending}
        >
          {redeemPending ? "Redeeming…" : "Redeem token"}
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
      <FeedbackAlert feedback={redeemFeedback} />
    </div>
  );
}
