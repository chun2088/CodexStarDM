import { randomBytes } from "crypto";
import { NextResponse } from "next/server";

import { authorizationErrorResponse, isAuthorizationError, requireAuthenticatedUser } from "@/lib/server-auth";
import { getSupabaseAdminClient } from "@/lib/supabase-client";

type InviteRow = {
  id: string;
  code: string;
  created_by: string | null;
  max_uses: number | null;
  used_count: number;
  last_used_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  metadata: unknown;
  created_at: string;
  updated_at: string;
};

type UserRow = {
  id: string;
  email: string | null;
  full_name: string | null;
};

type CreateInviteBody = {
  code?: string;
  maxUses?: number | null;
  expiresAt?: string | null;
  note?: string | null;
  createdBy?: string | null;
  isActive?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeCode(code: string) {
  return code.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "-");
}

function generateCode() {
  const buffer = randomBytes(4).toString("hex");
  return buffer.toUpperCase();
}

function parseMaxUses(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  const numberValue = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    return undefined;
  }

  return Math.floor(numberValue);
}

function parseIsoDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return parsed.toISOString();
}

export async function GET() {
  let auth;

  try {
    auth = await requireAuthenticatedUser({ requiredRole: "sales" });
  } catch (error) {
    if (isAuthorizationError(error)) {
      return authorizationErrorResponse(error);
    }

    throw error;
  }

  const { supabase } = auth;

  const { data: inviteRows, error: inviteError } = await supabase
    .from("store_invite_codes")
    .select(
      "id, code, created_by, max_uses, used_count, last_used_at, expires_at, is_active, metadata, created_at, updated_at",
    )
    .order("created_at", { ascending: false });

  if (inviteError) {
    console.error("Failed to load invite codes", inviteError);
    return NextResponse.json(
      { error: "Unable to load invite codes" },
      { status: 500 },
    );
  }

  const invites = (inviteRows ?? []) as InviteRow[];
  const creatorIds = Array.from(
    new Set(
      invites
        .map((invite) => invite.created_by)
        .filter((value): value is string => Boolean(value)),
    ),
  );

  let creators: UserRow[] = [];

  if (creatorIds.length > 0) {
    const { data: creatorRows, error: creatorError } = await supabase
      .from("users")
      .select("id, email, full_name")
      .in("id", creatorIds);

    if (creatorError) {
      console.error("Failed to load invite creators", creatorError);
      return NextResponse.json(
        { error: "Unable to load invite creators" },
        { status: 500 },
      );
    }

    creators = (creatorRows ?? []) as UserRow[];
  }

  const creatorsById = new Map(creators.map((creator) => [creator.id, creator]));

  const payload = invites.map((invite) => {
    const metadata = isRecord(invite.metadata) ? invite.metadata : {};
    const note = typeof metadata.note === "string" ? metadata.note : null;
    const remainingUses =
      invite.max_uses !== null ? Math.max(invite.max_uses - invite.used_count, 0) : null;
    const creator = invite.created_by ? creatorsById.get(invite.created_by) : null;

    return {
      id: invite.id,
      code: invite.code,
      maxUses: invite.max_uses,
      usedCount: invite.used_count,
      remainingUses,
      lastUsedAt: invite.last_used_at,
      expiresAt: invite.expires_at,
      isActive: invite.is_active,
      createdAt: invite.created_at,
      updatedAt: invite.updated_at,
      note,
      createdBy: creator
        ? {
            id: creator.id,
            email: creator.email,
            name: creator.full_name,
          }
        : invite.created_by
          ? {
              id: invite.created_by,
              email: null,
              name: null,
            }
          : null,
    };
  });

  return NextResponse.json({ inviteCodes: payload });
}

export async function POST(request: Request) {
  let auth;

  try {
    auth = await requireAuthenticatedUser({ requiredRole: "sales" });
  } catch (error) {
    if (isAuthorizationError(error)) {
      return authorizationErrorResponse(error);
    }

    throw error;
  }

  const { user } = auth;
  let body: CreateInviteBody;

  try {
    body = await request.json();
  } catch (error) {
    console.error("Failed to parse invite creation payload", error);
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const normalizedCode = body.code ? normalizeCode(body.code) : generateCode();

  if (!normalizedCode) {
    return NextResponse.json(
      { error: "Invite code could not be determined" },
      { status: 400 },
    );
  }

  const maxUses = parseMaxUses(body.maxUses ?? null);

  if (maxUses === undefined) {
    return NextResponse.json(
      { error: "maxUses must be a positive number" },
      { status: 400 },
    );
  }

  const expiresAt = parseIsoDate(body.expiresAt ?? null);

  if (expiresAt === undefined) {
    return NextResponse.json(
      { error: "expiresAt must be a valid date" },
      { status: 400 },
    );
  }

  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;
  const createdBy =
    typeof body.createdBy === "string" && body.createdBy.trim()
      ? body.createdBy.trim()
      : user.id;
  const isActive = body.isActive === undefined ? true : Boolean(body.isActive);

  const metadata: Record<string, unknown> = {};

  if (note) {
    metadata.note = note;
  }

  const supabase = getSupabaseAdminClient();

  const insertPayload: Record<string, unknown> = {
    code: normalizedCode,
    max_uses: maxUses,
    expires_at: expiresAt,
    created_by: createdBy,
    is_active: isActive,
    metadata,
  };

  const { data, error } = await supabase
    .from("store_invite_codes")
    .insert(insertPayload)
    .select(
      "id, code, created_by, max_uses, used_count, last_used_at, expires_at, is_active, metadata, created_at, updated_at",
    )
    .single();

  if (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "23505") {
      return NextResponse.json(
        { error: "Invite code already exists" },
        { status: 409 },
      );
    }

    console.error("Failed to create invite code", error);
    return NextResponse.json(
      { error: "Unable to create invite code" },
      { status: 500 },
    );
  }

  const createdInvite = data as InviteRow;

  return NextResponse.json(
    {
      inviteCode: {
        id: createdInvite.id,
        code: createdInvite.code,
        maxUses: createdInvite.max_uses,
        usedCount: createdInvite.used_count,
        lastUsedAt: createdInvite.last_used_at,
        expiresAt: createdInvite.expires_at,
        isActive: createdInvite.is_active,
        note,
        createdAt: createdInvite.created_at,
        updatedAt: createdInvite.updated_at,
      },
    },
    { status: 201 },
  );
}
