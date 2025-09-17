"use client";

import Link from "next/link";

import { useAvailableCoupons } from "./use-coupons";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0,
  }).format(value);
}

export function CustomerHomeView() {
  const { data: coupons = [], isLoading, error, refetch, isFetching } = useAvailableCoupons();

  const featuredCoupons = coupons.slice(0, 3);

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-wide text-slate-500 dark:text-slate-400">Welcome back</p>
          <h2 className="text-3xl font-semibold text-slate-900 dark:text-white">Discover new offers nearby</h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Claim and save coupons to your wallet. Active subscriptions keep redemptions smooth and QR codes fast.
          </p>
        </div>
        <Link
          href="/c/search"
          className="inline-flex items-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
        >
          Search coupons
        </Link>
      </header>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-xl font-semibold text-slate-900 dark:text-white">Featured coupons</h3>
          <button
            type="button"
            onClick={() => refetch()}
            className="inline-flex items-center rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-slate-400 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:text-white"
            disabled={isFetching}
          >
            {isFetching ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        {isLoading ? (
          <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">Loading coupons…</p>
        ) : error ? (
          <p className="mt-4 text-sm text-rose-600 dark:text-rose-300">{(error as Error).message}</p>
        ) : featuredCoupons.length === 0 ? (
          <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">No active coupons available right now.</p>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {featuredCoupons.map((coupon) => (
              <Link
                key={coupon.id}
                href={`/c/coupon/${coupon.id}`}
                className="group flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-1 hover:border-slate-400 hover:shadow-md dark:border-slate-700 dark:bg-slate-900"
              >
                <span className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{coupon.code}</span>
                <span className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">
                  {coupon.name ?? "Untitled coupon"}
                </span>
                {coupon.description ? (
                  <p className="mt-2 line-clamp-3 text-sm text-slate-600 dark:text-slate-300">{coupon.description}</p>
                ) : null}
                <div className="mt-4 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                  <span className="font-semibold text-slate-900 dark:text-white">{formatCurrency(coupon.discountValue)}</span>
                  <span>{coupon.discountType}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
