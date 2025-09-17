"use client";

import { StatusBadge } from "@/app/_components/status-badge";
import { ApiError, extractSubscriptionStatus, parseJsonResponse } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

type CouponDraft = {
  code: string;
  name: string;
  description: string;
  discountType: string;
  discountValue: number;
  maxRedemptions?: number | null;
  startAt?: string | null;
  endAt?: string | null;
};

type CreateCouponResponse = {
  message?: string;
  couponId?: string;
};

const DEFAULT_DRAFT: CouponDraft = {
  code: "",
  name: "",
  description: "",
  discountType: "flat",
  discountValue: 0,
  maxRedemptions: null,
  startAt: null,
  endAt: null,
};

function canUseAuthoring(status: string | null | undefined) {
  return status === "active" || status === "grace";
}

export function MerchantCouponsView() {
  const { user } = useAuth();
  const [draft, setDraft] = useState<CouponDraft>(DEFAULT_DRAFT);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string; subscriptionStatus?: string | null } | null>(
    null,
  );

  const storeId = user?.storeId ?? "";
  const subscriptionStatus = user?.storeSubscriptionStatus ?? null;
  const authoringEnabled = canUseAuthoring(subscriptionStatus);

  const mutation = useMutation<CreateCouponResponse, ApiError, CouponDraft>({
    mutationFn: async (input) => {
      const response = await fetch("/api/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...input,
          storeId,
        }),
      });

      return parseJsonResponse<CreateCouponResponse>(response);
    },
    onSuccess: (data) => {
      setFeedback({
        type: "success",
        message: data.message ?? `Coupon draft created${data.couponId ? ` (${data.couponId})` : ""}`,
      });
      setDraft(DEFAULT_DRAFT);
    },
    onError: (error) => {
      const status = extractSubscriptionStatus(error.payload);
      setFeedback({ type: "error", message: error.message, subscriptionStatus: status });
    },
  });

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!authoringEnabled) {
      setFeedback({ type: "error", message: "Coupon authoring is disabled until the subscription is reactivated." });
      return;
    }

    if (!storeId) {
      setFeedback({ type: "error", message: "Store ID is required. Ensure your profile is linked to a store." });
      return;
    }

    if (!draft.code.trim() || !draft.name.trim()) {
      setFeedback({ type: "error", message: "Code and name are required." });
      return;
    }

    if (!Number.isFinite(draft.discountValue) || draft.discountValue <= 0) {
      setFeedback({ type: "error", message: "Enter a valid discount value greater than zero." });
      return;
    }

    setFeedback(null);
    mutation.mutate({
      ...draft,
      code: draft.code.trim(),
      name: draft.name.trim(),
      description: draft.description.trim(),
    });
  };

  const updateDraft = (patch: Partial<CouponDraft>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  };

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900 dark:text-white">Create coupon</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Author coupons that pass sales review. Publishing is gated by your subscription status.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={subscriptionStatus ?? "inactive"} />
          <span className="text-xs text-slate-500 dark:text-slate-400">Store ID: {storeId || "Not linked"}</span>
        </div>
      </header>

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Coupon code</span>
            <input
              type="text"
              value={draft.code}
              onChange={(event) => updateDraft({ code: event.target.value })}
              placeholder="SPRING50"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-slate-500 dark:focus:ring-slate-600"
              disabled={!authoringEnabled}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Name</span>
            <input
              type="text"
              value={draft.name}
              onChange={(event) => updateDraft({ name: event.target.value })}
              placeholder="Spring Promotion"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-slate-500 dark:focus:ring-slate-600"
              disabled={!authoringEnabled}
            />
          </label>
        </div>
        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">Description</span>
          <textarea
            value={draft.description}
            onChange={(event) => updateDraft({ description: event.target.value })}
            rows={3}
            placeholder="Details about redemption windows and eligibility"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-slate-500 dark:focus:ring-slate-600"
            disabled={!authoringEnabled}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Discount type</span>
            <select
              value={draft.discountType}
              onChange={(event) => updateDraft({ discountType: event.target.value })}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-slate-500 dark:focus:ring-slate-600"
              disabled={!authoringEnabled}
            >
              <option value="flat">Flat amount</option>
              <option value="percent">Percent</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Discount value</span>
            <input
              type="number"
              min={0}
              value={draft.discountValue}
              onChange={(event) => updateDraft({ discountValue: Number(event.target.value) })}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-slate-500 dark:focus:ring-slate-600"
              disabled={!authoringEnabled}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Max redemptions</span>
            <input
              type="number"
              min={0}
              value={draft.maxRedemptions ?? ""}
              onChange={(event) =>
                updateDraft({
                  maxRedemptions: event.target.value === "" ? null : Number(event.target.value),
                })
              }
              placeholder="Unlimited"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-slate-500 dark:focus:ring-slate-600"
              disabled={!authoringEnabled}
            />
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Starts at</span>
            <input
              type="datetime-local"
              value={draft.startAt ?? ""}
              onChange={(event) => updateDraft({ startAt: event.target.value || null })}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-slate-500 dark:focus:ring-slate-600"
              disabled={!authoringEnabled}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Ends at</span>
            <input
              type="datetime-local"
              value={draft.endAt ?? ""}
              onChange={(event) => updateDraft({ endAt: event.target.value || null })}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-slate-500 dark:focus:ring-slate-600"
              disabled={!authoringEnabled}
            />
          </label>
        </div>
        <button
          type="submit"
          className="inline-flex items-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
          disabled={!authoringEnabled || mutation.isPending}
        >
          {mutation.isPending ? "Saving…" : "Save draft"}
        </button>
        {feedback ? (
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
        ) : null}
        {!authoringEnabled ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Coupon authoring is read-only until billing is reconnected and the subscription returns to active.
          </p>
        ) : null}
      </form>
    </section>
  );
}
