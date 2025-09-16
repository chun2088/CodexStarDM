import { NextResponse } from "next/server";

import { getSupabaseAdminClient } from "@/lib/supabase-client";
import { requestBillingPayment } from "@/lib/toss-client";
import {
  calculatePeriodEnd,
  fetchStoreById,
  upsertStoreSubscription,
} from "@/lib/store-service";

type CreateSubscriptionRequest = {
  storeId?: string;
  planId?: string;
  orderId?: string;
  orderName?: string;
  currency?: string;
  amountOverride?: number;
  metadata?: Record<string, unknown>;
};

function coerceNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

export async function POST(request: Request) {
  let body: CreateSubscriptionRequest;

  try {
    body = await request.json();
  } catch (error) {
    console.error("Failed to parse subscription payload", error);
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const { storeId, planId, orderId: providedOrderId, orderName, currency, amountOverride } = body ?? {};

  if (!storeId || typeof storeId !== "string") {
    return NextResponse.json(
      { error: "storeId is required" },
      { status: 400 },
    );
  }

  if (!planId || typeof planId !== "string") {
    return NextResponse.json(
      { error: "planId is required" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdminClient();

  let store;

  try {
    store = await fetchStoreById(supabase, storeId);
  } catch (error) {
    console.error("Failed to load store for subscription", error);
    return NextResponse.json(
      { error: "Unable to load store" },
      { status: 500 },
    );
  }

  if (!store) {
    return NextResponse.json(
      { error: "Store not found" },
      { status: 404 },
    );
  }

  const { data: plan, error: planError } = await supabase
    .from("subscription_plans")
    .select("id, name, price, currency, billing_interval, interval_count, is_active")
    .eq("id", planId)
    .maybeSingle();

  if (planError) {
    console.error("Failed to load subscription plan", planError);
    return NextResponse.json(
      { error: "Unable to load subscription plan" },
      { status: 500 },
    );
  }

  if (!plan) {
    return NextResponse.json(
      { error: "Subscription plan not found" },
      { status: 404 },
    );
  }

  if (!plan.is_active) {
    return NextResponse.json(
      { error: "Subscription plan is not active" },
      { status: 409 },
    );
  }

  const { data: billingProfile, error: billingError } = await supabase
    .from("store_billing_profiles")
    .select("id, store_id, billing_key, customer_key, status, metadata")
    .eq("store_id", storeId)
    .eq("status", "active")
    .maybeSingle();

  if (billingError) {
    console.error("Failed to load billing profile", billingError);
    return NextResponse.json(
      { error: "Unable to load billing profile" },
      { status: 500 },
    );
  }

  if (!billingProfile) {
    return NextResponse.json(
      { error: "Store does not have an active billing profile" },
      { status: 409 },
    );
  }

  const amountFromPlan = coerceNumber(plan.price);
  const overrideAmount = coerceNumber(amountOverride);
  const amount = overrideAmount ?? amountFromPlan;

  if (amount === null) {
    return NextResponse.json(
      { error: "Plan price is invalid" },
      { status: 422 },
    );
  }

  if (amount <= 0) {
    return NextResponse.json(
      { error: "Charge amount must be greater than zero" },
      { status: 422 },
    );
  }

  const subscriptionCurrency = typeof currency === "string" && currency.trim() ? currency : plan.currency ?? "KRW";
  const generatedOrderId = providedOrderId && typeof providedOrderId === "string" && providedOrderId.trim()
    ? providedOrderId.trim()
    : `subscription-${storeId}-${Date.now()}`;

  const resolvedOrderName = orderName && typeof orderName === "string" && orderName.trim()
    ? orderName.trim()
    : plan.name ?? "Subscription";

  const chargePayload = {
    customerKey: billingProfile.customer_key,
    orderId: generatedOrderId,
    amount,
    currency: subscriptionCurrency,
    orderName: resolvedOrderName,
  };

  let paymentResponse;

  try {
    paymentResponse = await requestBillingPayment(billingProfile.billing_key, chargePayload);
  } catch (error) {
    console.error("Failed to process Toss billing payment", error);
    const failureIso = new Date().toISOString();

    try {
      await upsertStoreSubscription(supabase, storeId, {
        status: "grace",
        planId: plan.id,
        billingProfileId: billingProfile.id,
        graceUntil: failureIso,
        metadataPatch: {
          lastPaymentError: (error as Error).message,
          lastPaymentAttemptAt: failureIso,
          lastPaymentOrderId: generatedOrderId,
        },
        event: {
          type: "billing.subscription_failed",
          at: failureIso,
          details: {
            orderId: generatedOrderId,
          },
        },
        eventContext: {
          actorId: store.owner_id,
        },
        eventSource: "api.billing.subscriptions.create",
      });
    } catch (updateError) {
      console.error("Failed to record failed subscription attempt", updateError);
    }

    return NextResponse.json(
      { error: "Unable to process subscription payment" },
      { status: 502 },
    );
  }

  const now = new Date();
  const approvedAt =
    (paymentResponse && typeof paymentResponse.approvedAt === "string" && paymentResponse.approvedAt) ||
    (paymentResponse && typeof paymentResponse.requestedAt === "string" && paymentResponse.requestedAt) ||
    now.toISOString();

  let periodStart = new Date(approvedAt);
  if (Number.isNaN(periodStart.getTime())) {
    periodStart = now;
  }

  const nextPeriod = calculatePeriodEnd(
    periodStart,
    (plan.billing_interval as "day" | "week" | "month" | "year") ?? "month",
    plan.interval_count ?? 1,
  );

  const periodStartIso = periodStart.toISOString();
  const periodEndIso = nextPeriod.toISOString();

  const subscription = await upsertStoreSubscription(supabase, storeId, {
    status: "active",
    planId: plan.id,
    billingProfileId: billingProfile.id,
    currentPeriodStart: periodStartIso,
    currentPeriodEnd: periodEndIso,
    graceUntil: periodEndIso,
    metadataPatch: {
      lastPayment: {
        orderId: generatedOrderId,
        paymentKey: paymentResponse?.paymentKey ?? null,
        approvedAt: paymentResponse?.approvedAt ?? null,
        amount,
        currency: subscriptionCurrency,
      },
    },
    event: {
      type: "billing.subscription_renewed",
      at: periodStartIso,
      details: {
        orderId: generatedOrderId,
        paymentKey: paymentResponse?.paymentKey ?? null,
      },
    },
    eventContext: {
      actorId: store.owner_id,
    },
    eventSource: "api.billing.subscriptions.create",
  });

  return NextResponse.json(
    {
      subscription: {
        id: subscription.id,
        storeId: subscription.store_id,
        planId: subscription.plan_id,
        status: subscription.status,
        currentPeriodStart: subscription.current_period_start,
        currentPeriodEnd: subscription.current_period_end,
        graceUntil: subscription.grace_until,
      },
      payment: {
        orderId: paymentResponse?.orderId ?? generatedOrderId,
        paymentKey: paymentResponse?.paymentKey ?? null,
        status: paymentResponse?.status ?? "APPROVED",
        approvedAt: paymentResponse?.approvedAt ?? null,
      },
    },
    { status: 201 },
  );
}
