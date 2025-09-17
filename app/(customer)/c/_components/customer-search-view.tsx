"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { useAvailableCoupons } from "./use-coupons";

export function CustomerSearchView() {
  const [query, setQuery] = useState("");
  const { data: coupons = [], isLoading, error } = useAvailableCoupons();

  const normalizedQuery = query.trim().toLowerCase();

  const filteredCoupons = useMemo(() => {
    if (!normalizedQuery) {
      return coupons;
    }

    return coupons.filter((coupon) => {
      const haystack = [coupon.name, coupon.description, coupon.code]
        .filter(Boolean)
        .map((value) => value?.toLowerCase() ?? "")
        .join(" ");
      return haystack.includes(normalizedQuery);
    });
  }, [coupons, normalizedQuery]);

  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-3xl font-semibold text-slate-900 dark:text-white">Search coupons</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Look up active coupons by name, code, or description. Only offers from merchants with an active subscription are
          surfaced.
        </p>
      </header>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Search</label>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Enter keyword or coupon code"
          className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-slate-500 dark:focus:ring-slate-600"
        />

        <div className="mt-6 space-y-4">
          {isLoading ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">Loading coupons…</p>
          ) : error ? (
            <p className="text-sm text-rose-600 dark:text-rose-300">{(error as Error).message}</p>
          ) : filteredCoupons.length === 0 ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {normalizedQuery ? "No coupons match your search." : "No active coupons available right now."}
            </p>
          ) : (
            <ul className="divide-y divide-slate-200 dark:divide-slate-800">
              {filteredCoupons.map((coupon) => (
                <li key={coupon.id} className="py-3">
                  <Link
                    href={`/c/coupon/${coupon.id}`}
                    className="flex items-center justify-between gap-4 rounded-lg px-2 py-1 transition hover:bg-slate-100 dark:hover:bg-slate-800/60"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">{coupon.name ?? coupon.code}</p>
                      {coupon.description ? (
                        <p className="text-xs text-slate-600 dark:text-slate-400">{coupon.description}</p>
                      ) : null}
                    </div>
                    <span className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{coupon.code}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
