"use client";

import { StatusBadge } from "@/app/_components/status-badge";
import { ApiError, extractSubscriptionStatus, parseJsonResponse } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
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

function canManageBilling(status: string | null | undefined) {
  return status === "active" || status === "grace";
}

export function MerchantSubscriptionView() {
  const { user } = useAuth();
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
    </section>
  );
}
