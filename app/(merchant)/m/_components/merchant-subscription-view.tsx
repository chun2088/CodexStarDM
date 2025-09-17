"use client";

import { StatusBadge } from "@/app/_components/status-badge";
import { ApiError, extractSubscriptionStatus, parseJsonResponse } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import type { StoreSubscriptionStatus } from "@/lib/store-service";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

type RegisterBillingKeyResponse = {
  billingKey: string;
  customerKey: string;
  profile: {
    id: string;
    status: string;
    updatedAt: string;
  };
};

type CreateSubscriptionResponse = {
  subscription: {
    id: string;
    planId: string | null;
    status: string;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    graceUntil: string | null;
  };
  payment: {
    orderId: string;
    status: string;
    approvedAt: string | null;
  };
};

type CancelSubscriptionResponse = {
  message?: string;
  subscription: {
    id: string;
    status: string;
    graceUntil: string | null;
    canceledAt: string | null;
  };
  revokedBillingProfiles: string[];
  invoice?: {
    type?: string;
    issuedAt?: string;
    amount?: number | null;
    currency?: string | null;
    graceUntil?: string | null;
    note?: string | null;
    reason?: string | null;
  } | null;
  refund?: {
    amount: number;
    currency: string | null;
    processedAt: string;
    note?: string | null;
  } | null;
  subscriptionStatus?: string;
};

function canManageBilling(status: string | null | undefined) {
  return status === "active" || status === "grace";
}

export function MerchantSubscriptionView() {
  const { user, login } = useAuth();
  const [customerKey, setCustomerKey] = useState("");
  const [authKey, setAuthKey] = useState("");
  const [planId, setPlanId] = useState("");
  const [orderName, setOrderName] = useState("Subscription");
  const [amount, setAmount] = useState<string>("");
  const [registerFeedback, setRegisterFeedback] = useState<
    { type: "success" | "error"; message: string; subscriptionStatus?: string | null } | null
  >(null);
  const [subscribeFeedback, setSubscribeFeedback] = useState<
    { type: "success" | "error"; message: string; subscriptionStatus?: string | null } | null
  >(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelGraceUntil, setCancelGraceUntil] = useState("");
  const [endImmediately, setEndImmediately] = useState(false);
  const [cancelRefundAmount, setCancelRefundAmount] = useState("");
  const [cancelRefundCurrency, setCancelRefundCurrency] = useState("KRW");
  const [cancelRefundNote, setCancelRefundNote] = useState("");
  const [cancelFeedback, setCancelFeedback] = useState<
    { type: "success" | "error"; message: string; subscriptionStatus?: string | null } | null
  >(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  const storeId = user?.storeId ?? "";
  const subscriptionStatus = user?.storeSubscriptionStatus ?? null;
  const billingEnabled = canManageBilling(subscriptionStatus);

  const registerMutation = useMutation<RegisterBillingKeyResponse, ApiError, { customerKey: string; authKey: string }>(
    {
      mutationFn: async ({ customerKey: customer, authKey: auth }) => {
        const response = await fetch("/api/billing/keys", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ storeId, customerKey: customer, authKey: auth }),
        });

        return parseJsonResponse<RegisterBillingKeyResponse>(response);
      },
      onSuccess: (data) => {
        setRegisterFeedback({
          type: "success",
          message: `Billing key ${data.billingKey} registered for customer ${data.customerKey}.`,
        });
        setCustomerKey("");
        setAuthKey("");
      },
      onError: (error) => {
        setRegisterFeedback({
          type: "error",
          message: error.message,
          subscriptionStatus: extractSubscriptionStatus(error.payload),
        });
      },
    },
  );

  const subscriptionMutation = useMutation<
    CreateSubscriptionResponse,
    ApiError,
    { planId: string; orderName?: string; amountOverride?: number | null }
  >({
    mutationFn: async ({ planId: plan, orderName: order, amountOverride }) => {
      const response = await fetch("/api/billing/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId,
          planId: plan,
          orderName: order,
          amountOverride,
        }),
      });

      return parseJsonResponse<CreateSubscriptionResponse>(response);
    },
    onSuccess: (data) => {
      const nextMessage = `Subscription ${data.subscription.id} set to ${data.subscription.status}. Payment ${data.payment.status}.`;
      setSubscribeFeedback({ type: "success", message: nextMessage });
    },
    onError: (error) => {
      setSubscribeFeedback({
        type: "error",
        message: error.message,
        subscriptionStatus: extractSubscriptionStatus(error.payload),
      });
    },
  });

  const cancelMutation = useMutation<
    CancelSubscriptionResponse,
    ApiError,
    {
      reason?: string;
      graceUntil?: string | null;
      refundAmount?: number | null;
      refundCurrency?: string | null;
      refundNote?: string | null;
    }
  >({
    mutationFn: async (payload) => {
      const response = await fetch("/api/billing/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId,
          ...payload,
        }),
      });

      return parseJsonResponse<CancelSubscriptionResponse>(response);
    },
    onSuccess: (data) => {
      const summaryParts: string[] = [];
      const accessUntil = data.subscription.graceUntil ?? data.invoice?.graceUntil ?? null;

      if (accessUntil) {
        const label = new Date(accessUntil);
        summaryParts.push(
          Number.isNaN(label.getTime())
            ? `Access continues until ${accessUntil}`
            : `Access continues until ${label.toLocaleString()}`,
        );
      }

      if (data.refund && typeof data.refund.amount === "number" && data.refund.amount > 0) {
        const currencyLabel = data.refund.currency ? ` ${data.refund.currency}` : "";
        summaryParts.push(`Refund ${data.refund.amount}${currencyLabel}`);
      }

      const baseMessage = data.message ?? `Subscription ${data.subscription.id} canceled.`;
      const detailMessage = summaryParts
        .map((part) => {
          const trimmed = part.trim();
          return trimmed.endsWith(".") ? trimmed : `${trimmed}.`;
        })
        .join(" ");
      const nextStatus: StoreSubscriptionStatus =
        (data.subscription.status as StoreSubscriptionStatus | undefined) ??
        (data.subscriptionStatus as StoreSubscriptionStatus | undefined) ??
        "canceled";

      const message = summaryParts.length ? `${baseMessage} ${detailMessage}`.trim() : baseMessage;

      setCancelFeedback({
        type: "success",
        message,
        subscriptionStatus: data.subscription.status ?? data.subscriptionStatus ?? nextStatus,
      });

      setConfirmingCancel(false);
      setCancelReason("");
      setCancelGraceUntil("");
      setEndImmediately(false);
      setCancelRefundAmount("");
      setCancelRefundNote("");
      setCancelRefundCurrency("KRW");

      if (user) {
        login({ ...user, storeSubscriptionStatus: nextStatus });
      }
    },
    onError: (error) => {
      setConfirmingCancel(false);
      setCancelFeedback({
        type: "error",
        message: error.message,
        subscriptionStatus: extractSubscriptionStatus(error.payload),
      });
    },
  });

  const handleRegister = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!billingEnabled) {
      setRegisterFeedback({ type: "error", message: "Billing updates require an active or grace subscription." });
      return;
    }

    if (!storeId) {
      setRegisterFeedback({ type: "error", message: "Store ID is required." });
      return;
    }

    if (!customerKey.trim() || !authKey.trim()) {
      setRegisterFeedback({ type: "error", message: "Customer key and auth key are required." });
      return;
    }

    setRegisterFeedback(null);
    registerMutation.mutate({ customerKey: customerKey.trim(), authKey: authKey.trim() });
  };

  const handleSubscribe = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!billingEnabled) {
      setSubscribeFeedback({ type: "error", message: "Activate billing to manage subscriptions." });
      return;
    }

    if (!storeId) {
      setSubscribeFeedback({ type: "error", message: "Store ID is required." });
      return;
    }

    if (!planId.trim()) {
      setSubscribeFeedback({ type: "error", message: "Plan ID is required." });
      return;
    }

    const overrideAmount = amount.trim() ? Number(amount) : null;

    setSubscribeFeedback(null);
    subscriptionMutation.mutate({
      planId: planId.trim(),
      orderName: orderName.trim() || undefined,
      amountOverride: Number.isFinite(overrideAmount ?? NaN) ? overrideAmount : null,
    });
  };

  const handleCancel = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!billingEnabled) {
      setCancelFeedback({ type: "error", message: "Only active or grace subscriptions can be canceled." });
      return;
    }

    if (!storeId) {
      setCancelFeedback({ type: "error", message: "Store ID is required." });
      return;
    }

    if (cancelMutation.isPending) {
      return;
    }

    if (!confirmingCancel) {
      setConfirmingCancel(true);
      setCancelFeedback({ type: "error", message: "Confirm subscription cancellation to proceed." });
      return;
    }

    const payload: {
      reason?: string;
      graceUntil?: string | null;
      refundAmount?: number | null;
      refundCurrency?: string | null;
      refundNote?: string | null;
    } = {};

    if (cancelReason.trim()) {
      payload.reason = cancelReason.trim();
    }

    if (endImmediately) {
      payload.graceUntil = null;
    } else if (cancelGraceUntil.trim()) {
      const parsed = new Date(cancelGraceUntil);
      if (Number.isNaN(parsed.getTime())) {
        setCancelFeedback({ type: "error", message: "Grace period end must be a valid date." });
        return;
      }
      payload.graceUntil = parsed.toISOString();
    }

    if (cancelRefundAmount.trim()) {
      const amountValue = Number(cancelRefundAmount);
      if (!Number.isFinite(amountValue) || amountValue < 0) {
        setCancelFeedback({ type: "error", message: "Refund amount must be a positive number." });
        return;
      }

      if (amountValue > 0) {
        payload.refundAmount = amountValue;
        const currency = cancelRefundCurrency.trim();
        if (currency) {
          payload.refundCurrency = currency.toUpperCase();
        }
        if (cancelRefundNote.trim()) {
          payload.refundNote = cancelRefundNote.trim();
        }
      }
    }

    setCancelFeedback(null);
    cancelMutation.mutate(payload);
  };

  const handleCancelReset = () => {
    setConfirmingCancel(false);
    setCancelFeedback(null);
  };

  const renderFeedback = (
    feedback:
      | {
          type: "success" | "error";
          message: string;
          subscriptionStatus?: string | null;
        }
      | null,
  ) => {
    if (!feedback) {
      return null;
    }

    return (
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
    );
  };

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900 dark:text-white">Subscription &amp; billing</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Register billing keys and trigger subscription renewals once Toss Payments billing fixes are deployed.
          </p>
        </div>
        <StatusBadge status={subscriptionStatus ?? "inactive"} />
      </header>

      <form
        onSubmit={handleRegister}
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70"
      >
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Register billing key</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Provide the Toss customer key and auth key to vault a billing key for recurring charges.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Customer key</span>
            <input
              type="text"
              value={customerKey}
              onChange={(event) => setCustomerKey(event.target.value)}
              placeholder="cus_Kx..."
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-slate-500 dark:focus:ring-slate-600"
              disabled={!billingEnabled}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Auth key</span>
            <input
              type="text"
              value={authKey}
              onChange={(event) => setAuthKey(event.target.value)}
              placeholder="billing auth key"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-slate-500 dark:focus:ring-slate-600"
              disabled={!billingEnabled}
            />
          </label>
        </div>
        <button
          type="submit"
          className="inline-flex items-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
          disabled={!billingEnabled || registerMutation.isPending}
        >
          {registerMutation.isPending ? "Registering…" : "Register billing key"}
        </button>
        {renderFeedback(registerFeedback)}
        {!billingEnabled ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Billing changes are locked until the subscription is reactivated or payment succeeds.
          </p>
        ) : null}
      </form>

      <form
        onSubmit={handleSubscribe}
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70"
      >
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Create subscription charge</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Trigger a billing cycle with the plan identifier. Use amount override for manual retries.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Plan ID</span>
            <input
              type="text"
              value={planId}
              onChange={(event) => setPlanId(event.target.value)}
              placeholder="plan_monthly_001"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-slate-500 dark:focus:ring-slate-600"
              disabled={!billingEnabled}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Order name</span>
            <input
              type="text"
              value={orderName}
              onChange={(event) => setOrderName(event.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-slate-500 dark:focus:ring-slate-600"
              disabled={!billingEnabled}
            />
          </label>
        </div>
        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">Amount override (KRW)</span>
          <input
            type="number"
            min={0}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="Leave blank to use plan price"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-slate-500 dark:focus:ring-slate-600"
            disabled={!billingEnabled}
          />
        </label>
        <button
          type="submit"
          className="inline-flex items-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
          disabled={!billingEnabled || subscriptionMutation.isPending}
        >
          {subscriptionMutation.isPending ? "Charging…" : "Create subscription charge"}
        </button>
        {renderFeedback(subscribeFeedback)}
      </form>

      <form
        onSubmit={handleCancel}
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70"
      >
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Cancel subscription</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Revoke active billing profiles and end the current subscription. Set a grace period or record a refund if applicable.
          </p>
        </div>
        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">Cancellation reason</span>
          <textarea
            value={cancelReason}
            onChange={(event) => setCancelReason(event.target.value)}
            rows={2}
            placeholder="Optional context for the cancellation"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-slate-500 dark:focus:ring-slate-600"
            disabled={!billingEnabled || cancelMutation.isPending}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Grace period end</span>
            <input
              type="datetime-local"
              value={cancelGraceUntil}
              onChange={(event) => setCancelGraceUntil(event.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-slate-500 dark:focus:ring-slate-600"
              disabled={!billingEnabled || endImmediately || cancelMutation.isPending}
            />
            <p className="text-xs text-slate-500 dark:text-slate-400">Leave blank to keep the current period end.</p>
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={endImmediately}
              onChange={(event) => {
                setEndImmediately(event.target.checked);
                if (event.target.checked) {
                  setCancelGraceUntil("");
                }
              }}
              className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:ring-slate-600"
              disabled={!billingEnabled || cancelMutation.isPending}
            />
            <span>End access immediately</span>
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Refund amount</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={cancelRefundAmount}
              onChange={(event) => setCancelRefundAmount(event.target.value)}
              placeholder="Optional pro-rated refund"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-slate-500 dark:focus:ring-slate-600"
              disabled={!billingEnabled || cancelMutation.isPending}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Refund currency</span>
            <input
              type="text"
              value={cancelRefundCurrency}
              onChange={(event) => setCancelRefundCurrency(event.target.value.toUpperCase())}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-slate-500 dark:focus:ring-slate-600"
              disabled={!billingEnabled || cancelMutation.isPending || !cancelRefundAmount.trim()}
              maxLength={6}
            />
          </label>
          <label className="space-y-1 text-sm sm:col-span-3">
            <span className="font-medium text-slate-700 dark:text-slate-300">Refund note</span>
            <input
              type="text"
              value={cancelRefundNote}
              onChange={(event) => setCancelRefundNote(event.target.value)}
              placeholder="Optional memo for the refund"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-slate-500 dark:focus:ring-slate-600"
              disabled={!billingEnabled || cancelMutation.isPending}
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className="inline-flex items-center rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-rose-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 disabled:opacity-60 dark:bg-rose-500 dark:hover:bg-rose-400 dark:focus-visible:ring-rose-400"
            disabled={!billingEnabled || cancelMutation.isPending}
          >
            {cancelMutation.isPending
              ? "Canceling…"
              : confirmingCancel
                ? "Confirm cancel subscription"
                : "Cancel subscription"}
          </button>
          {confirmingCancel ? (
            <button
              type="button"
              onClick={handleCancelReset}
              className="inline-flex items-center rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              disabled={cancelMutation.isPending}
            >
              Keep subscription
            </button>
          ) : null}
        </div>
        {renderFeedback(cancelFeedback)}
        {!billingEnabled ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Subscription is already canceled. Renew billing to restore access.
          </p>
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Canceling immediately revokes billing profiles and updates the store status to canceled.
          </p>
        )}
      </form>
    </section>
  );
}
