"use client";

import { StatusBadge } from "@/app/_components/status-badge";
import { ApiError, extractSubscriptionStatus, parseJsonResponse } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

type CouponStatus = "draft" | "pending" | "active" | "paused" | "archived";

type CouponApprovalState = {
  status: string;
  decidedAt: string | null;
  decidedBy: string | null;
  reason: string | null;
};

type MerchantCoupon = {
  id: string;
  code: string;
  name: string | null;
  description: string | null;
  discountType: string;
  discountValue: number;
  maxRedemptions: number | null;
  redeemedCount: number;
  startAt: string | null;
  endAt: string | null;
  status: CouponStatus;
  isActive: boolean;
  approval: CouponApprovalState;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  storeId: string | null;
};

type MerchantCouponsResponse = {
  coupons: MerchantCoupon[];
};

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

type UpdateCouponResponse = {
  message?: string;
  couponId?: string;
  status?: string;
};

type PatchCouponInput = {
  payload: Record<string, unknown>;
  resetForm?: boolean;
  successMessage?: string;
};

type FeedbackState = {
  type: "success" | "error";
  message: string;
  subscriptionStatus?: string | null;
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

const EDITABLE_STATUSES: ReadonlySet<CouponStatus> = new Set(["draft", "pending"]);

function canUseAuthoring(status: string | null | undefined) {
  return status === "active" || status === "grace";
}

function toDateTimeInputValue(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString();
}

function describeDiscount(coupon: MerchantCoupon) {
  const normalized = coupon.discountType.toLowerCase();

  if (normalized === "percentage" || normalized === "percent") {
    return `${coupon.discountValue}% off`;
  }

  return `$${coupon.discountValue.toFixed(2)} off`;
}

function describeRedemptions(coupon: MerchantCoupon) {
  if (coupon.maxRedemptions === null) {
    return `${coupon.redeemedCount} redeemed`;
  }

  return `${coupon.redeemedCount} / ${coupon.maxRedemptions} redeemed`;
}

type LifecycleAction = {
  label: string;
  nextStatus: CouponStatus;
  tone: "primary" | "secondary" | "danger";
};

function getLifecycleActions(status: CouponStatus): LifecycleAction[] {
  switch (status) {
    case "draft":
      return [
        { label: "Submit for review", nextStatus: "pending", tone: "primary" },
        { label: "Archive", nextStatus: "archived", tone: "danger" },
      ];
    case "pending":
      return [
        { label: "Back to draft", nextStatus: "draft", tone: "secondary" },
        { label: "Archive", nextStatus: "archived", tone: "danger" },
      ];
    case "active":
      return [
        { label: "Pause", nextStatus: "paused", tone: "secondary" },
        { label: "Archive", nextStatus: "archived", tone: "danger" },
      ];
    case "paused":
      return [
        { label: "Resume", nextStatus: "active", tone: "primary" },
        { label: "Archive", nextStatus: "archived", tone: "danger" },
      ];
    case "archived":
    default:
      return [];
  }
}

function actionButtonClasses(tone: LifecycleAction["tone"]) {
  const base =
    "inline-flex items-center rounded-full px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2";

  switch (tone) {
    case "primary":
      return `${base} bg-slate-900 text-white shadow hover:bg-slate-700 focus-visible:ring-slate-400 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200`;
    case "danger":
      return `${base} bg-rose-600 text-white shadow hover:bg-rose-500 focus-visible:ring-rose-400`;
    default:
      return `${base} border border-slate-300 text-slate-700 hover:bg-slate-100 focus-visible:ring-slate-400 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800`;
  }
}

export function MerchantCouponsView() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<CouponDraft>({ ...DEFAULT_DRAFT });
  const [editingCouponId, setEditingCouponId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);

  const storeId = user?.storeId ?? "";
  const subscriptionStatus = user?.storeSubscriptionStatus ?? null;
  const authoringEnabled = canUseAuthoring(subscriptionStatus);

  const couponsQuery = useQuery<MerchantCoupon[], ApiError>({
    queryKey: ["merchant", "coupons"],
    queryFn: async () => {
      const response = await fetch("/api/coupons?scope=merchant", { cache: "no-store" });
      const payload = await parseJsonResponse<MerchantCouponsResponse>(response);
      return payload?.coupons ?? [];
    },
  });

  const createMutation = useMutation<CreateCouponResponse, ApiError, CouponDraft>({
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
      setDraft({ ...DEFAULT_DRAFT });
      setEditingCouponId(null);
      queryClient.invalidateQueries({ queryKey: ["merchant", "coupons"] });
    },
    onError: (error) => {
      const status = extractSubscriptionStatus(error.payload);
      setFeedback({ type: "error", message: error.message, subscriptionStatus: status });
    },
  });

  const patchMutation = useMutation<UpdateCouponResponse, ApiError, PatchCouponInput>({
    mutationFn: async ({ payload }) => {
      const response = await fetch("/api/coupons", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      return parseJsonResponse<UpdateCouponResponse>(response);
    },
    onSuccess: (data, variables) => {
      setFeedback({
        type: "success",
        message: data.message ?? variables.successMessage ?? "Coupon updated.",
      });
      if (variables.resetForm) {
        setEditingCouponId(null);
        setDraft({ ...DEFAULT_DRAFT });
      }
      queryClient.invalidateQueries({ queryKey: ["merchant", "coupons"] });
    },
    onError: (error) => {
      const status = extractSubscriptionStatus(error.payload);
      setFeedback({ type: "error", message: error.message, subscriptionStatus: status });
    },
  });

  const isMutating = createMutation.isPending || patchMutation.isPending;

  const ensureCanMutate = () => {
    if (!authoringEnabled) {
      setFeedback({
        type: "error",
        message: "Coupon authoring is disabled until the subscription is reactivated.",
      });
      return false;
    }

    if (!storeId) {
      setFeedback({
        type: "error",
        message: "Store ID is required. Ensure your profile is linked to a store.",
      });
      return false;
    }

    return true;
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!ensureCanMutate()) {
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

    const payloadBase: CouponDraft = {
      code: draft.code.trim(),
      name: draft.name.trim(),
      description: draft.description.trim(),
      discountType: draft.discountType,
      discountValue: draft.discountValue,
      maxRedemptions: draft.maxRedemptions ?? null,
      startAt: draft.startAt || null,
      endAt: draft.endAt || null,
    };

    setFeedback(null);

    if (editingCouponId) {
      patchMutation.mutate({
        payload: {
          id: editingCouponId,
          ...payloadBase,
          storeId,
        },
        resetForm: true,
      });
    } else {
      createMutation.mutate(payloadBase);
    }
  };

  const updateDraft = (patch: Partial<CouponDraft>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  };

  const coupons = couponsQuery.data ?? [];
  const editingCoupon = editingCouponId
    ? coupons.find((coupon) => coupon.id === editingCouponId) ?? null
    : null;

  const beginEditing = (coupon: MerchantCoupon) => {
    if (!authoringEnabled) {
      return;
    }

    const normalizedType = coupon.discountType.toLowerCase();
    setEditingCouponId(coupon.id);
    setDraft({
      code: coupon.code,
      name: coupon.name ?? "",
      description: coupon.description ?? "",
      discountType: normalizedType === "percentage" ? "percent" : "flat",
      discountValue: coupon.discountValue,
      maxRedemptions: coupon.maxRedemptions,
      startAt: toDateTimeInputValue(coupon.startAt),
      endAt: toDateTimeInputValue(coupon.endAt),
    });
    setFeedback(null);
  };

  const cancelEditing = () => {
    setEditingCouponId(null);
    setDraft({ ...DEFAULT_DRAFT });
  };

  const handleStatusChange = (coupon: MerchantCoupon, nextStatus: CouponStatus) => {
    if (!ensureCanMutate()) {
      return;
    }

    setFeedback(null);
    patchMutation.mutate({
      payload: {
        id: coupon.id,
        status: nextStatus,
        storeId,
      },
      resetForm: editingCouponId === coupon.id,
    });
  };

  const canEditCoupon = (status: CouponStatus) => EDITABLE_STATUSES.has(status);

  return (
    <section className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900 dark:text-white">Manage coupons</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Author drafts, submit for review, and control lifecycle states. Publishing is gated by your subscription status.
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
        {editingCouponId ? (
          <div className="flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-200">
            <span>Editing coupon {editingCoupon?.code ?? editingCouponId}</span>
            <button
              type="button"
              className="text-slate-700 underline-offset-2 transition hover:underline disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-200"
              onClick={cancelEditing}
              disabled={isMutating}
            >
              Cancel
            </button>
          </div>
        ) : null}
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
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className="inline-flex items-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
            disabled={!authoringEnabled || isMutating}
          >
            {isMutating ? "Saving…" : editingCouponId ? "Update coupon" : "Save draft"}
          </button>
          {editingCouponId ? (
            <button
              type="button"
              className="inline-flex items-center rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              onClick={cancelEditing}
              disabled={isMutating}
            >
              Exit editing
            </button>
          ) : null}
        </div>
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

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Your coupons</h2>
            {couponsQuery.isFetching ? (
              <span className="text-xs text-slate-500 dark:text-slate-400">Refreshing…</span>
            ) : null}
          </div>
          <button
            type="button"
            className="inline-flex items-center rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            onClick={() => couponsQuery.refetch()}
            disabled={couponsQuery.isFetching}
          >
            Refresh
          </button>
        </div>
        {couponsQuery.isLoading ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Loading coupons…</p>
        ) : couponsQuery.isError ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
            Failed to load coupons: {couponsQuery.error.message}
          </div>
        ) : coupons.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No coupons yet. Draft one above to get started.</p>
        ) : (
          <>
            <div className="hidden lg:block">
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                  <thead className="bg-slate-50 dark:bg-slate-900/40">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Code
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Details
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Discount
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Window
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Redemptions
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {coupons.map((coupon) => {
                      const lifecycleActions = getLifecycleActions(coupon.status);
                      const canEdit = canEditCoupon(coupon.status);

                      return (
                        <tr key={coupon.id} className="align-top">
                          <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {coupon.code}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                            <div className="font-medium text-slate-900 dark:text-white">{coupon.name ?? "—"}</div>
                            {coupon.description ? (
                              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{coupon.description}</p>
                            ) : null}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <div className="flex flex-col gap-2">
                              <StatusBadge status={coupon.status} />
                              <StatusBadge
                                status={coupon.approval.status}
                                label={`Sales: ${coupon.approval.status}`}
                              />
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                            {describeDiscount(coupon)}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                            <div>Start: {formatDateTime(coupon.startAt)}</div>
                            <div>End: {formatDateTime(coupon.endAt)}</div>
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                            {describeRedemptions(coupon)}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <div className="flex flex-wrap gap-2">
                              {canEdit ? (
                                <button
                                  type="button"
                                  className={actionButtonClasses("secondary")}
                                  onClick={() => beginEditing(coupon)}
                                  disabled={!authoringEnabled || isMutating}
                                >
                                  Edit
                                </button>
                              ) : null}
                              {lifecycleActions.map((action) => (
                                <button
                                  key={action.label}
                                  type="button"
                                  className={actionButtonClasses(action.tone)}
                                  onClick={() => handleStatusChange(coupon, action.nextStatus)}
                                  disabled={!authoringEnabled || isMutating}
                                >
                                  {action.label}
                                </button>
                              ))}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="space-y-4 lg:hidden">
              {coupons.map((coupon) => {
                const lifecycleActions = getLifecycleActions(coupon.status);
                const canEdit = canEditCoupon(coupon.status);

                return (
                  <div
                    key={coupon.id}
                    className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">{coupon.code}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{coupon.name ?? "Unnamed coupon"}</p>
                      </div>
                      <StatusBadge status={coupon.status} />
                    </div>
                    {coupon.description ? (
                      <p className="text-sm text-slate-600 dark:text-slate-300">{coupon.description}</p>
                    ) : null}
                    <div className="flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <StatusBadge
                        status={coupon.approval.status}
                        label={`Sales: ${coupon.approval.status}`}
                      />
                      <span>{describeDiscount(coupon)}</span>
                      <span>{describeRedemptions(coupon)}</span>
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      <div>Start: {formatDateTime(coupon.startAt)}</div>
                      <div>End: {formatDateTime(coupon.endAt)}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {canEdit ? (
                        <button
                          type="button"
                          className={actionButtonClasses("secondary")}
                          onClick={() => beginEditing(coupon)}
                          disabled={!authoringEnabled || isMutating}
                        >
                          Edit
                        </button>
                      ) : null}
                      {lifecycleActions.map((action) => (
                        <button
                          key={action.label}
                          type="button"
                          className={actionButtonClasses(action.tone)}
                          onClick={() => handleStatusChange(coupon, action.nextStatus)}
                          disabled={!authoringEnabled || isMutating}
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>
    </section>
  );
}
