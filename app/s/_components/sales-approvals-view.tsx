"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";

import { StatusBadge } from "@/app/_components/status-badge";

type CouponApproval = {
  status: "pending" | "approved" | "rejected" | string;
  decidedAt: string | null;
  decidedBy: string | null;
  reason: string | null;
  history?: {
    status: string;
    decidedAt: string | null;
    decidedBy: string | null;
    reason: string | null;
  }[];
};

type SalesCoupon = {
  id: string;
  code: string;
  name: string | null;
  description: string | null;
  discountType: string;
  discountValue: number;
  startAt: string | null;
  endAt: string | null;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
  approval: CouponApproval;
  merchant: {
    id: string;
    name: string | null;
    email: string | null;
  };
  store: {
    id: string;
    name: string;
    subscriptionStatus: string;
  } | null;
};

type SalesCouponResponse = {
  coupons: SalesCoupon[];
};

const EMPTY_COUPONS: SalesCoupon[] = [];

async function fetchCoupons() {
  const response = await fetch("/api/sales/approvals", { cache: "no-store" });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Failed to load coupons");
  }

  return (await response.json()) as SalesCouponResponse;
}

async function postApproval(
  couponId: string,
  body: Record<string, unknown>,
  action: "approve" | "reject",
) {
  const response = await fetch(`/api/sales/approvals/${couponId}/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `Failed to ${action} coupon`);
  }

  return response.json();
}

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString();
}

export function SalesApprovalsView() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["sales", "approvals"],
    queryFn: fetchCoupons,
  });

  const [decidedBy, setDecidedBy] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackType, setFeedbackType] = useState<"success" | "error" | null>(null);
  const [rejectingCouponId, setRejectingCouponId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const coupons = data?.coupons ?? EMPTY_COUPONS;

  const pendingCount = useMemo(
    () => coupons.filter((coupon) => coupon.approval.status === "pending").length,
    [coupons],
  );

  const approveMutation = useMutation<unknown, Error, string>({
    mutationFn: (couponId) =>
      postApproval(couponId, { decidedBy: decidedBy || null }, "approve"),
    onSuccess: () => {
      setFeedback("Coupon approved successfully");
      setFeedbackType("success");
      queryClient.invalidateQueries({ queryKey: ["sales", "approvals"] });
    },
    onError: (mutationError) => {
      setFeedback(mutationError.message);
      setFeedbackType("error");
    },
  });

  const rejectMutation = useMutation<unknown, Error, string>({
    mutationFn: (couponId) =>
      postApproval(
        couponId,
        {
          decidedBy: decidedBy || null,
          reason: rejectReason,
        },
        "reject",
      ),
    onSuccess: () => {
      setFeedback("Coupon rejected");
      setFeedbackType("success");
      setRejectingCouponId(null);
      setRejectReason("");
      queryClient.invalidateQueries({ queryKey: ["sales", "approvals"] });
    },
    onError: (mutationError) => {
      setFeedback(mutationError.message);
      setFeedbackType("error");
    },
  });

  const handleApprove = (couponId: string) => {
    setFeedback(null);
    setFeedbackType(null);
    approveMutation.mutate(couponId);
  };

  const handleReject = (couponId: string) => {
    setFeedback(null);
    setFeedbackType(null);
    setRejectingCouponId(couponId);
    setRejectReason("");
  };

  const handleRejectSubmit = (event: FormEvent<HTMLFormElement>, couponId: string) => {
    event.preventDefault();

    if (!rejectReason.trim()) {
      setFeedback("Please provide a rejection reason");
      setFeedbackType("error");
      return;
    }

    rejectMutation.mutate(couponId);
  };

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">Coupon Approvals</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Review pending coupon submissions and manage approval status.
          </p>
        </div>
        <div className="text-right">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Decision recorded by
          </label>
          <input
            type="text"
            value={decidedBy}
            onChange={(event) => setDecidedBy(event.target.value)}
            placeholder="Team member name"
            className="mt-1 w-48 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-slate-400 dark:focus:ring-slate-600"
          />
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Total Coupons</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{coupons.length}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Pending Review</p>
          <p className="mt-2 text-2xl font-semibold text-amber-600 dark:text-amber-300">{pendingCount}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Approved</p>
          <p className="mt-2 text-2xl font-semibold text-emerald-600 dark:text-emerald-300">
            {coupons.filter((coupon) => coupon.approval.status === "approved").length}
          </p>
        </div>
      </div>

      {feedback ? (
        <div
          className={`rounded-md border p-4 text-sm ${
            feedbackType === "success"
              ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
              : "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200"
          }`}
        >
          {feedback}
        </div>
      ) : null}

      {isLoading ? (
        <p className="text-sm text-slate-600 dark:text-slate-300">Loading coupons…</p>
      ) : error ? (
        <div className="rounded-md border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
          {(error as Error).message}
        </div>
      ) : coupons.length === 0 ? (
        <p className="text-sm text-slate-600 dark:text-slate-300">No coupons found.</p>
      ) : (
        <div className="space-y-4">
          {coupons.map((coupon) => {
            const isPending = coupon.approval.status === "pending";
            const isRejected = coupon.approval.status === "rejected";
            const showActions = isPending || isRejected;

            return (
              <article
                key={coupon.id}
                className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{coupon.code}</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      {coupon.name ?? "Untitled coupon"}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500 dark:text-slate-400">
                      <span>
                        Discount: {coupon.discountValue} {coupon.discountType}
                      </span>
                      {coupon.store ? <span>Store: {coupon.store.name}</span> : null}
                      <span>Merchant: {coupon.merchant.name ?? coupon.merchant.id}</span>
                    </div>
                  </div>
                  <StatusBadge status={coupon.approval.status} />
                </div>

                <dl className="mt-4 grid gap-3 text-sm text-slate-600 dark:text-slate-300 sm:grid-cols-3">
                  <div>
                    <dt className="font-medium text-slate-500 dark:text-slate-400">Submitted</dt>
                    <dd className="mt-1 text-slate-900 dark:text-white">{formatDate(coupon.createdAt)}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-slate-500 dark:text-slate-400">Last Updated</dt>
                    <dd className="mt-1 text-slate-900 dark:text-white">{formatDate(coupon.updatedAt)}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-slate-500 dark:text-slate-400">Decision</dt>
                    <dd className="mt-1 text-slate-900 dark:text-white">
                      {coupon.approval.decidedAt ? formatDate(coupon.approval.decidedAt) : "Awaiting review"}
                    </dd>
                  </div>
                </dl>

                {coupon.approval.decidedBy ? (
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                    Decision by:{" "}
                    <span className="font-medium text-slate-900 dark:text-white">
                      {coupon.approval.decidedBy}
                    </span>
                  </p>
                ) : null}

                {coupon.approval.reason ? (
                  <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
                    Rejection reason: {coupon.approval.reason}
                  </p>
                ) : null}

                {(() => {
                  const historyEntries = coupon.approval.history?.slice(0, -1) ?? [];
                  if (historyEntries.length === 0) {
                    return null;
                  }

                  return (
                    <details className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
                      <summary className="cursor-pointer font-medium text-slate-700 dark:text-slate-200">
                        View decision history
                      </summary>
                      <ul className="mt-2 space-y-2">
                        {historyEntries.map((entry, index) => (
                          <li key={`${coupon.id}-history-${index}`} className="border-b border-slate-200 pb-2 last:border-none last:pb-0 dark:border-slate-800">
                            <div className="flex flex-wrap justify-between gap-2">
                              <StatusBadge status={entry.status} />
                              <span className="text-xs text-slate-500 dark:text-slate-400">
                                {formatDate(entry.decidedAt)}
                              </span>
                            </div>
                            {entry.reason ? (
                              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Reason: {entry.reason}</p>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </details>
                  );
                })()}

                {showActions ? (
                  <div className="mt-4 space-y-3">
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => handleApprove(coupon.id)}
                        disabled={approveMutation.isLoading && approveMutation.variables === coupon.id}
                        className="inline-flex items-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-70"
                      >
                        {approveMutation.isLoading && approveMutation.variables === coupon.id
                          ? "Approving…"
                          : "Approve"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReject(coupon.id)}
                        disabled={rejectMutation.isLoading && rejectMutation.variables === coupon.id}
                        className="inline-flex items-center rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-70"
                      >
                        {rejectMutation.isLoading && rejectMutation.variables === coupon.id
                          ? "Processing…"
                          : "Reject"}
                      </button>
                    </div>

                    {rejectingCouponId === coupon.id ? (
                      <form
                        onSubmit={(event) => handleRejectSubmit(event, coupon.id)}
                        className="space-y-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm dark:border-rose-900 dark:bg-rose-950/40"
                      >
                        <label className="block text-xs font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-200">
                          Rejection reason
                        </label>
                        <textarea
                          value={rejectReason}
                          onChange={(event) => setRejectReason(event.target.value)}
                          rows={3}
                          className="w-full resize-none rounded-md border border-rose-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-200 dark:border-rose-800 dark:bg-slate-950 dark:text-white"
                        />
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="submit"
                            disabled={rejectMutation.isLoading}
                            className="inline-flex items-center rounded-md bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-70"
                          >
                            {rejectMutation.isLoading ? "Submitting…" : "Submit rejection"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRejectingCouponId(null);
                              setRejectReason("");
                            }}
                            className="inline-flex items-center rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
