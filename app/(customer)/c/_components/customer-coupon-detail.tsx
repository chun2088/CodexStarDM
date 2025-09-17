"use client";

import Link from "next/link";

import { StatusBadge } from "@/app/_components/status-badge";
import { useAvailableCoupons } from "./use-coupons";

export function CustomerCouponDetail({ couponId }: { couponId: string }) {
  const { data: coupons = [], isLoading, error, refetch, isFetching } = useAvailableCoupons();

  const coupon = coupons.find((item) => item.id === couponId);

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-wide text-slate-500 dark:text-slate-400">Coupon detail</p>
          <h1 className="text-3xl font-semibold text-slate-900 dark:text-white">
            {coupon?.name ?? "Coupon not found"}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Code: {coupon?.code ?? "-"}</p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          className="inline-flex items-center rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-400 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:text-white"
          disabled={isFetching}
        >
          {isFetching ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      {isLoading ? (
        <p className="text-sm text-slate-600 dark:text-slate-300">Loading coupon…</p>
      ) : error ? (
        <p className="text-sm text-rose-600 dark:text-rose-300">{(error as Error).message}</p>
      ) : !coupon ? (
        <p className="text-sm text-slate-600 dark:text-slate-300">
          The coupon could not be found. It may have expired or the merchant subscription is inactive.
        </p>
      ) : (
        <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status="active" label="Available" />
            <span className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Discount type: {coupon.discountType}
            </span>
          </div>
          {coupon.description ? (
            <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-200">{coupon.description}</p>
          ) : null}
          <dl className="grid gap-4 text-sm text-slate-600 dark:text-slate-300 sm:grid-cols-2">
            <div>
              <dt className="font-medium text-slate-500 dark:text-slate-400">Value</dt>
              <dd className="mt-1 font-semibold text-slate-900 dark:text-white">{coupon.discountValue}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500 dark:text-slate-400">Store</dt>
              <dd className="mt-1">{coupon.storeId ?? "Not specified"}</dd>
            </div>
          </dl>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
            <p className="font-semibold text-slate-900 dark:text-white">How to redeem</p>
            <ol className="mt-2 list-decimal space-y-1 pl-4">
              <li>Claim the coupon into your wallet using the wallet ID {coupon.storeId ? `for store ${coupon.storeId}` : ""}.</li>
              <li>Generate a QR token from the wallet page when you are ready to redeem.</li>
              <li>Present the QR token to the merchant within 120 seconds for scanning.</li>
            </ol>
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              Need to manage your wallet? Visit the <Link href="/c/wallet" className="font-semibold underline">wallet</Link> page.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
