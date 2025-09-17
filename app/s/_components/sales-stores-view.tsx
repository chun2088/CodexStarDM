"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { StatusBadge } from "@/app/_components/status-badge";

type SalesStore = {
  id: string;
  name: string;
  slug: string | null;
  subscriptionStatus: string;
  createdAt: string;
  updatedAt: string;
  owner: {
    id: string;
    email: string | null;
    name: string | null;
  };
  inviteCode: {
    id: string;
    code: string;
    maxUses: number | null;
    usedCount: number;
    isActive: boolean;
  } | null;
};

type SalesStoresResponse = {
  stores: SalesStore[];
};

const EMPTY_STORES: SalesStore[] = [];

async function fetchStores() {
  const response = await fetch("/api/sales/stores", { cache: "no-store" });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Failed to load stores");
  }

  return (await response.json()) as SalesStoresResponse;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

export function SalesStoresView() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["sales", "stores"],
    queryFn: fetchStores,
  });

  const stores = data?.stores ?? EMPTY_STORES;

  const totals = useMemo(() => {
    const total = stores.length;
    const active = stores.filter((store) => store.subscriptionStatus === "active").length;
    const grace = stores.filter((store) => store.subscriptionStatus === "grace").length;

    return { total, active, grace };
  }, [stores]);

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">Stores</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Monitor the merchant stores assigned to you and keep an eye on their subscription health.
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          className="inline-flex items-center rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
          disabled={isFetching}
        >
          {isFetching ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Assigned Stores</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{totals.total}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Active Assignments</p>
          <p className="mt-2 text-2xl font-semibold text-emerald-600 dark:text-emerald-300">{totals.active}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">In Grace Period</p>
          <p className="mt-2 text-2xl font-semibold text-amber-600 dark:text-amber-300">{totals.grace}</p>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-600 dark:text-slate-300">Loading stores…</p>
      ) : error ? (
        <div className="rounded-md border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
          {(error as Error).message}
        </div>
      ) : stores.length === 0 ? (
        <p className="text-sm text-slate-600 dark:text-slate-300">
          You don&apos;t have any stores assigned yet. Once an administrator links a store to your account, it will appear here.
        </p>
      ) : (
        <div className="space-y-4">
          {stores.map((store) => {
            const invite = store.inviteCode;
            const inviteStatus = invite
              ? invite.isActive
                ? "Active"
                : "Inactive"
              : null;

            return (
              <article
                key={store.id}
                className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                      {store.name}
                    </h3>
                    {store.slug ? (
                      <p className="text-sm text-slate-500 dark:text-slate-400">/{store.slug}</p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                      <span>Owner:</span>
                      <span className="font-medium text-slate-900 dark:text-white">
                        {store.owner.name ?? "Unknown"}
                      </span>
                      {store.owner.email ? <span>• {store.owner.email}</span> : null}
                    </div>
                  </div>
                  <StatusBadge status={store.subscriptionStatus} />
                </div>
                <dl className="mt-4 grid gap-3 text-sm text-slate-600 dark:text-slate-300 sm:grid-cols-3">
                  <div>
                    <dt className="font-medium text-slate-500 dark:text-slate-400">Created</dt>
                    <dd className="mt-1 text-slate-900 dark:text-white">{formatDate(store.createdAt)}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-slate-500 dark:text-slate-400">Updated</dt>
                    <dd className="mt-1 text-slate-900 dark:text-white">{formatDate(store.updatedAt)}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-slate-500 dark:text-slate-400">Invite Code</dt>
                    <dd className="mt-1">
                      {invite ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-slate-900 dark:text-white">{invite.code}</span>
                          {inviteStatus ? <StatusBadge status={inviteStatus} /> : null}
                          {invite.maxUses !== null ? (
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              {invite.usedCount}/{invite.maxUses} uses
                            </span>
                          ) : (
                            <span className="text-xs text-slate-500 dark:text-slate-400">Unlimited uses</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-500 dark:text-slate-400">Not issued</span>
                      )}
                    </dd>
                  </div>
                </dl>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
