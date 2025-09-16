import { NextResponse } from "next/server";

import { getSupabaseAdminClient } from "@/lib/supabase-client";
import {
  calculatePeriodEnd,
  upsertStoreSubscription,
} from "@/lib/store-service";

type TossWebhookPayload = {
  eventType?: string;
  billingKey?: string;
  customerKey?: string;
  data?: Record<string, unknown> | null;
};

type SubscriptionPlanRow = {
  id: string;
  billing_interval: "day" | "week" | "month" | "year";
  interval_count: number;
};

const SUCCESS_EVENTS = new Set([
  "PAYMENT_APPROVED",
  "BILLING_APPROVED",
  "PAYMENT_SUCCEEDED",
]);

const FAILURE_EVENTS = new Set([
  "PAYMENT_FAILED",
  "BILLING_FAILED",
  "PAYMENT_DECLINED",
]);

const CANCEL_EVENTS = new Set([
  "BILLING_KEY_DELETED",
  "SUBSCRIPTION_CANCELED",
  "PAYMENT_CANCELED",
]);

function normalizeEventType(value: string) {
  return value.trim().toUpperCase();
}

function coerceTimestamp(value: unknown, fallback: string) {
  if (typeof value === "string" && value) {
    return value;
  }

  return fallback;
}

function safeDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date();
  }

  return date;
}

export async function POST(request: Request) {
  let payload: TossWebhookPayload;

  try {
    payload = await request.json();
  } catch (error) {
    console.error("Failed to parse Toss webhook payload", error);
    return NextResponse.json(
      { error: "Invalid payload" },
      { status: 400 },
    );
  }

  const rawEventType = typeof payload.eventType === "string" ? payload.eventType : "";

  if (!rawEventType.trim()) {
    return NextResponse.json(
      { error: "eventType is required" },
      { status: 400 },
    );
  }

  const eventType = normalizeEventType(rawEventType);
  const billingKey = typeof payload.billingKey === "string" ? payload.billingKey : null;
  const customerKey = typeof payload.customerKey === "string" ? payload.customerKey : null;

  if (!billingKey && !customerKey) {
    return NextResponse.json(
      { error: "billingKey or customerKey is required" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdminClient();

  const { data: profileByKey } = billingKey
    ? await supabase
        .from("store_billing_profiles")
        .select("id, store_id, billing_key, customer_key, status")
        .eq("billing_key", billingKey)
        .maybeSingle()
    : { data: null };

  const { data: profileByCustomer } = !profileByKey && customerKey
    ? await supabase
        .from("store_billing_profiles")
        .select("id, store_id, billing_key, customer_key, status")
        .eq("customer_key", customerKey)
        .order("created_at", { ascending: false })
        .maybeSingle()
    : { data: null };

  const billingProfile = profileByKey ?? profileByCustomer;

  if (!billingProfile) {
    console.warn("Received Toss webhook for unknown billing profile", {
      eventType,
      billingKey,
      customerKey,
    });

    return NextResponse.json({ message: "No matching billing profile" }, { status: 202 });
  }

  const storeId = billingProfile.store_id;

  const { data: subscription, error: subscriptionError } = await supabase
    .from("store_subscriptions")
    .select("id, store_id, plan_id, current_period_end")
    .eq("store_id", storeId)
    .maybeSingle();

  if (subscriptionError) {
    console.error("Failed to load store subscription for webhook", subscriptionError);
    return NextResponse.json(
      { error: "Unable to load store subscription" },
      { status: 500 },
    );
  }

  const eventData = (payload.data && typeof payload.data === "object")
    ? (payload.data as Record<string, unknown>)
    : {};

  if (SUCCESS_EVENTS.has(eventType)) {
    const planId = subscription?.plan_id;
    let plan: SubscriptionPlanRow | null = null;

    if (planId) {
      const { data: planRow, error: planError } = await supabase
        .from("subscription_plans")
        .select("id, billing_interval, interval_count")
        .eq("id", planId)
        .maybeSingle();

      if (planError) {
        console.error("Failed to load plan for webhook", planError);
      } else {
        plan = planRow as SubscriptionPlanRow | null;
      }
    }

    const nowIso = new Date().toISOString();
    const approvedAt = coerceTimestamp(eventData.approvedAt, nowIso);
    const startDate = safeDate(approvedAt);
    const interval = plan?.billing_interval ?? "month";
    const count = plan?.interval_count ?? 1;
    const nextPeriod = calculatePeriodEnd(startDate, interval, count);

    try {
      const subscriptionRecord = await upsertStoreSubscription(supabase, storeId, {
        status: "active",
        planId: planId ?? null,
        billingProfileId: billingProfile.id,
        currentPeriodStart: startDate.toISOString(),
        currentPeriodEnd: nextPeriod.toISOString(),
        graceUntil: nextPeriod.toISOString(),
        metadataPatch: {
          lastWebhookEvent: eventType,
          lastPayment: {
            orderId: eventData.orderId ?? null,
            paymentKey: eventData.paymentKey ?? billingKey ?? null,
            approvedAt: approvedAt,
          },
        },
        event: {
          type: `billing.webhook_${eventType.toLowerCase()}`,
          at: startDate.toISOString(),
          details: {
            orderId: eventData.orderId ?? null,
            paymentKey: eventData.paymentKey ?? null,
          },
        },
      });

      return NextResponse.json(
        {
          status: "processed",
          subscriptionId: subscriptionRecord.id,
        },
        { status: 200 },
      );
    } catch (error) {
      console.error("Failed to update subscription for success webhook", error);
      return NextResponse.json(
        { error: "Unable to update subscription state" },
        { status: 500 },
      );
    }
  }

  if (FAILURE_EVENTS.has(eventType)) {
    const nowIso = new Date().toISOString();
    const failedAt = coerceTimestamp(eventData.failedAt, nowIso);
    const failureDate = safeDate(failedAt);

    let graceUntilIso = nowIso;

    if (subscription?.current_period_end) {
      const existingGrace = safeDate(subscription.current_period_end);
      graceUntilIso = existingGrace.toISOString();
    } else {
      const graceDate = calculatePeriodEnd(failureDate, "day", 3);
      graceUntilIso = graceDate.toISOString();
    }

    try {
      await upsertStoreSubscription(supabase, storeId, {
        status: "grace",
        planId: subscription?.plan_id ?? null,
        billingProfileId: billingProfile.id,
        graceUntil: graceUntilIso,
        metadataPatch: {
          lastWebhookEvent: eventType,
          lastPaymentError: eventData.message ?? null,
          lastPaymentOrderId: eventData.orderId ?? null,
          lastPaymentFailedAt: failedAt,
        },
        event: {
          type: `billing.webhook_${eventType.toLowerCase()}`,
          at: failureDate.toISOString(),
          details: {
            orderId: eventData.orderId ?? null,
          },
        },
      });

      return NextResponse.json({ status: "grace" }, { status: 200 });
    } catch (error) {
      console.error("Failed to record grace period after payment failure", error);
      return NextResponse.json(
        { error: "Unable to update store subscription" },
        { status: 500 },
      );
    }
  }

  if (CANCEL_EVENTS.has(eventType)) {
    const nowIso = new Date().toISOString();
    const canceledAt = coerceTimestamp(eventData.canceledAt ?? eventData.deletedAt, nowIso);

    try {
      await upsertStoreSubscription(supabase, storeId, {
        status: "canceled",
        planId: subscription?.plan_id ?? null,
        billingProfileId: billingProfile.id,
        graceUntil: null,
        canceledAt,
        metadataPatch: {
          lastWebhookEvent: eventType,
        },
        event: {
          type: `billing.webhook_${eventType.toLowerCase()}`,
          at: safeDate(canceledAt).toISOString(),
          details: {
            billingKey,
          },
        },
      });

      const { error: revokeError } = await supabase
        .from("store_billing_profiles")
        .update({ status: "revoked" })
        .eq("id", billingProfile.id);

      if (revokeError) {
        console.error("Failed to revoke billing profile after cancellation", revokeError);
      }

      return NextResponse.json({ status: "canceled" }, { status: 200 });
    } catch (error) {
      console.error("Failed to update store subscription for cancellation", error);
      return NextResponse.json(
        { error: "Unable to update store subscription" },
        { status: 500 },
      );
    }
  }

  console.info("Ignored Toss webhook event", { eventType });
  return NextResponse.json({ status: "ignored" }, { status: 200 });
}
