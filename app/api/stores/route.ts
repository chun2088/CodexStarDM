import { NextResponse } from "next/server";

import { authorizationErrorResponse, isAuthorizationError, requireAuthenticatedUser } from "@/lib/server-auth";
import { getSupabaseAdminClient } from "@/lib/supabase-client";
import {
  ensureInviteIsUsable,
  findInviteCode,
  markInviteCodeUsed,
  upsertStoreSubscription,
} from "@/lib/store-service";

const SLUG_REGEX = /[^a-z0-9-]+/g;

type CreateStoreRequest = {
  inviteCode?: string;
  name?: string;
  slug?: string | null;
  metadata?: Record<string, unknown>;
};

function generateSlug(name: string) {
  const normalized = name.trim().toLowerCase().replace(/\s+/g, "-");
  return normalized.replace(SLUG_REGEX, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

export async function POST(request: Request) {
  let body: CreateStoreRequest;

  try {
    body = await request.json();
  } catch (error) {
    console.error("Failed to parse store payload", error);
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const { inviteCode, name, slug: providedSlug, metadata } = body ?? {};

  if (!inviteCode || typeof inviteCode !== "string") {
    return NextResponse.json(
      { error: "inviteCode is required" },
      { status: 400 },
    );
  }

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json(
      { error: "name is required" },
      { status: 400 },
    );
  }

  let auth;

  try {
    auth = await requireAuthenticatedUser({ requiredRole: "merchant" });
  } catch (error) {
    if (isAuthorizationError(error)) {
      return authorizationErrorResponse(error);
    }

    throw error;
  }

  const { supabase: merchantSupabase, user } = auth;
  const ownerId = user.id;
  const adminSupabase = getSupabaseAdminClient();

  const normalizedSlug = providedSlug
    ? generateSlug(providedSlug)
    : generateSlug(name);
  const slugValue = normalizedSlug || null;

  let invite;

  try {
    invite = await findInviteCode(adminSupabase, inviteCode);
  } catch (error) {
    console.error("Failed to load invite code", error);
    return NextResponse.json(
      { error: "Unable to validate invite code" },
      { status: 500 },
    );
  }

  if (!invite) {
    return NextResponse.json(
      { error: "Invite code not found" },
      { status: 404 },
    );
  }

  try {
    ensureInviteIsUsable(invite);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 409 },
    );
  }

  const { data: existingStore, error: storeLookupError } = await merchantSupabase
    .from("stores")
    .select("id")
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (storeLookupError) {
    console.error("Failed to check existing store", storeLookupError);
    return NextResponse.json(
      { error: "Unable to verify existing store" },
      { status: 500 },
    );
  }

  if (existingStore) {
    return NextResponse.json(
      { error: "Owner already has an associated store" },
      { status: 409 },
    );
  }

  const storeMetadata =
    metadata && typeof metadata === "object"
      ? { ...metadata, createdByInvite: invite.code }
      : { createdByInvite: invite.code };

  const { data: store, error: storeError } = await merchantSupabase
    .from("stores")
    .insert({
      owner_id: ownerId,
      invite_code_id: invite.id,
      name: name.trim(),
      slug: slugValue,
      subscription_status: "grace",
      metadata: storeMetadata,
    })
    .select("id, owner_id, name, slug, subscription_status, created_at, updated_at")
    .single();

  if (storeError) {
    if (typeof storeError === "object" && storeError && "code" in storeError && storeError.code === "23505") {
      return NextResponse.json(
        { error: "Store slug already exists" },
        { status: 409 },
      );
    }

    console.error("Failed to create store", storeError);
    return NextResponse.json(
      { error: "Unable to create store" },
      { status: 500 },
    );
  }

  try {
    await markInviteCodeUsed(adminSupabase, invite);
  } catch (error) {
    console.error("Failed to mark invite code as used", error);
    await adminSupabase
      .from("stores")
      .delete()
      .eq("id", store.id)
      .catch((deleteError) => {
        console.error("Failed to rollback store creation after invite failure", deleteError);
      });
    return NextResponse.json(
      { error: "Invite code could not be redeemed" },
      { status: 409 },
    );
  }

  const nowIso = new Date().toISOString();

  try {
    await upsertStoreSubscription(adminSupabase, store.id, {
      status: "grace",
      planId: null,
      billingProfileId: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      graceUntil: null,
      metadataPatch: {
        onboardedAt: nowIso,
      },
      event: {
        type: "store.created",
        at: nowIso,
        details: {
          inviteCodeId: invite.id,
        },
      },
      eventContext: {
        actorId: ownerId,
      },
      eventSource: "api.stores.create",
    });
  } catch (error) {
    console.error("Failed to initialize store subscription", error);
  }

  return NextResponse.json(
    {
      store: {
        id: store.id,
        ownerId: store.owner_id,
        name: store.name,
        slug: store.slug,
        subscriptionStatus: store.subscription_status,
        createdAt: store.created_at,
        updatedAt: store.updated_at,
      },
    },
    { status: 201 },
  );
}
