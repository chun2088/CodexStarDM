"use client";

import { StatusBadge } from "@/app/_components/status-badge";

import { FeedbackAlert } from "./customer-wallet-feedback";
import { TokenCountdown } from "./customer-wallet-token-countdown";
import { formatDateTime } from "./customer-wallet-utils";
import type { GenerateQrResponse } from "./use-customer-wallet-controls";
import type { ActiveQrToken, WalletCouponEntry } from "./use-wallet";
import type { Feedback } from "./customer-wallet-feedback";

type CouponActionsSectionProps = {
  selectedEntry: WalletCouponEntry | null;
  activeQrToken: ActiveQrToken | null;
  activeTokenMatchesSelection: boolean;
  onClaimSelected: () => void;
  onGenerateQr: () => void;
  claimPending: boolean;
  qrPending: boolean;
  qrResult: GenerateQrResponse | null;
  qrFeedback: Feedback | null;
};

export function CouponActionsSection({
  selectedEntry,
  activeQrToken,
  activeTokenMatchesSelection,
  onClaimSelected,
  onGenerateQr,
  claimPending,
  qrPending,
  qrResult,
  qrFeedback,
}: CouponActionsSectionProps) {
  return (
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
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{selectedEntry.couponDescription}</p>
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
              onClick={onClaimSelected}
              className="inline-flex items-center rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:text-white"
              disabled={claimPending}
            >
              {claimPending ? "Claiming…" : "Claim selected coupon"}
            </button>
            <button
              type="button"
              onClick={onGenerateQr}
              className="inline-flex items-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
              disabled={qrPending}
            >
              {qrPending ? "Generating…" : "Generate QR token"}
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
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Expires at {formatDateTime(qrResult.expiresAt)}</p>
            </div>
          ) : null}

          <FeedbackAlert feedback={qrFeedback} />
        </div>
      ) : (
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Select a coupon from the wallet list to view details and generate QR tokens.
        </p>
      )}
    </div>
  );
}
