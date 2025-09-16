import { NextResponse } from "next/server";

import { getSupabaseAdminClient } from "@/lib/supabase-client";

type StoreRow = {
  id: string;
  owner_id: string;
  invite_code_id: string | null;
  name: string;
  slug: string | null;
  subscription_status: string;
  created_at: string;
  updated_at: string;
};

type UserRow = {
  id: string;
  email: string | null;
  full_name: string | null;
};

type InviteCodeRow = {
  id: string;
  code: string;
  max_uses: number | null;
  used_count: number;
  is_active: boolean;
};

export async function GET() {
  const supabase = getSupabaseAdminClient();

  const { data: storeRows, error: storeError } = await supabase
    .from("stores")
    .select(
      "id, owner_id, invite_code_id, name, slug, subscription_status, created_at, updated_at",
    )
    .order("created_at", { ascending: false });

  if (storeError) {
    console.error("Failed to load stores for sales dashboard", storeError);
    return NextResponse.json(
      { error: "Unable to load stores" },
      { status: 500 },
    );
  }

  const stores = (storeRows ?? []) as StoreRow[];
  const ownerIds = Array.from(new Set(stores.map((store) => store.owner_id)));
  const inviteIds = Array.from(
    new Set(
      stores
        .map((store) => store.invite_code_id)
        .filter((value): value is string => Boolean(value)),
    ),
  );

  let owners: UserRow[] = [];

  if (ownerIds.length > 0) {
    const { data: ownerRows, error: ownerError } = await supabase
      .from("users")
      .select("id, email, full_name")
      .in("id", ownerIds);

    if (ownerError) {
      console.error("Failed to load store owners for sales dashboard", ownerError);
      return NextResponse.json(
        { error: "Unable to load store owners" },
        { status: 500 },
      );
    }

    owners = (ownerRows ?? []) as UserRow[];
  }

  let invites: InviteCodeRow[] = [];

  if (inviteIds.length > 0) {
    const { data: inviteRows, error: inviteError } = await supabase
      .from("store_invite_codes")
      .select("id, code, max_uses, used_count, is_active")
      .in("id", inviteIds);

    if (inviteError) {
      console.error("Failed to load invite codes for sales dashboard", inviteError);
      return NextResponse.json(
        { error: "Unable to load invite codes" },
        { status: 500 },
      );
    }

    invites = (inviteRows ?? []) as InviteCodeRow[];
  }

  const ownersById = new Map(owners.map((owner) => [owner.id, owner]));
  const invitesById = new Map(invites.map((invite) => [invite.id, invite]));

  const payload = stores.map((store) => {
    const owner = ownersById.get(store.owner_id);
    const invite = store.invite_code_id
      ? invitesById.get(store.invite_code_id)
      : null;

    return {
      id: store.id,
      name: store.name,
      slug: store.slug,
      subscriptionStatus: store.subscription_status,
      createdAt: store.created_at,
      updatedAt: store.updated_at,
      owner: owner
        ? {
            id: owner.id,
            email: owner.email,
            name: owner.full_name,
          }
        : {
            id: store.owner_id,
            email: null,
            name: null,
          },
      inviteCode: invite
        ? {
            id: invite.id,
            code: invite.code,
            maxUses: invite.max_uses,
            usedCount: invite.used_count,
            isActive: invite.is_active,
          }
        : null,
    };
  });

  return NextResponse.json({ stores: payload });
}
