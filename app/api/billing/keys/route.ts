import { NextResponse } from "next/server";

import { getSupabaseAdminClient } from "@/lib/supabase-client";
import { issueBillingKey } from "@/lib/toss-client";
import {
  StoreFeatureAccessError,
  assertStoreFeatureAccess,
  fetchStoreById,
  upsertStoreSubscription,
} from "@/lib/store-service";

type RegisterBillingKeyRequest = {
  storeId?: string;
  customerKey?: string;
  authKey?: string;
  metadata?: Record<string, unknown>;
};

export async function POST(request: Request) {
  let body: RegisterBillingKeyRequest;

  try {
    body = await request.json();
  } catch (error) {
    console.error("Failed to parse billing key payload", error);
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const { storeId, customerKey, authKey, metadata } = body ?? {};

  if (!storeId || typeof storeId !== "string") {
    return NextResponse.json(
      { error: "storeId is required" },
      { status: 400 },
    );
  }

  if (!customerKey || typeof customerKey !== "string") {
    return NextResponse.json(
      { error: "customerKey is required" },
      { status: 400 },
    );
  }

  if (!authKey || typeof authKey !== "string") {
    return NextResponse.json(
      { error: "authKey is required" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdminClient();

  let store;

  try {
    store = await fetchStoreById(supabase, storeId);
  } catch (error) {
    console.error("Failed to load store for billing key", error);
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

  try {
    assertStoreFeatureAccess(store.subscription_status, "billing.key", store.name);
  } catch (error) {
    if (error instanceof StoreFeatureAccessError) {
      return NextResponse.json(
        { error: error.message, subscriptionStatus: error.status },
        { status: 402 },
      );
    }

    console.error("Unexpected error validating store subscription", error);
    return NextResponse.json(
      { error: "Unable to validate store subscription" },
      { status: 500 },
    );
  }

  let tossResponse;

  try {
    tossResponse = await issueBillingKey({ customerKey, authKey });
  } catch (error) {
    console.error("Failed to issue Toss billing key", error);
    return NextResponse.json(
      { error: "Unable to register billing key" },
      { status: 502 },
    );
  }

  const normalizedMetadata = metadata && typeof metadata === "object" ? metadata : {};

  const nowIso = new Date().toISOString();

  const { error: revokeError } = await supabase
    .from("store_billing_profiles")
    .update({ status: "revoked" })
    .eq("store_id", storeId)
    .eq("status", "active");

  if (revokeError) {
    console.error("Failed to revoke existing billing profiles", revokeError);
  }

  const profilePayload = {
    store_id: storeId,
    provider: "toss" as const,
    billing_key: tossResponse.billingKey,
    customer_key: tossResponse.customerKey,
    status: "active",
    metadata: {
      ...normalizedMetadata,
      lastIssuedAt: nowIso,
      card: tossResponse.card ?? null,
    },
  };

  const { data: profile, error: profileError } = await supabase
    .from("store_billing_profiles")
    .upsert(profilePayload, { onConflict: "billing_key" })
    .select("id, store_id, billing_key, customer_key, status, metadata, created_at, updated_at")
    .single();

  if (profileError) {
    console.error("Failed to persist billing profile", profileError);
    return NextResponse.json(
      { error: "Unable to persist billing profile" },
      { status: 500 },
    );
  }

  try {
    await upsertStoreSubscription(supabase, storeId, {
      status: store.subscription_status,
      billingProfileId: profile.id,
      metadataPatch: {
        billingKeyRegisteredAt: nowIso,
      },
      event: {
        type: "billing.key_registered",
        at: nowIso,
        details: {
          billingProfileId: profile.id,
        },
      },
    });
  } catch (error) {
    console.error("Failed to update store subscription metadata", error);
  }

  return NextResponse.json(
    {
      billingKey: profile.billing_key,
      customerKey: profile.customer_key,
      profile: {
        id: profile.id,
        status: profile.status,
        metadata: profile.metadata,
        updatedAt: profile.updated_at,
      },
    },
    { status: 201 },
  );
}
