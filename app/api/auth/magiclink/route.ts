import { randomBytes } from "node:crypto";

import { AuthApiError } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { getSupabaseAdminClient } from "@/lib/supabase-client";
import { MAGIC_LINK_TOKEN_TTL_MS, storeMagicLinkToken } from "@/lib/token-store";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SECONDS_IN_MS = 1000;

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function sanitizeRedirect(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("http")) {
    return null;
  }

  if (!trimmed.startsWith("/")) {
    return null;
  }

  return trimmed;
}

function buildMagicLink(originUrl: string, token: string, redirectTo: string | null) {
  const magicLinkUrl = new URL("/api/auth/callback", originUrl);
  magicLinkUrl.searchParams.set("token", token);

  if (redirectTo) {
    magicLinkUrl.searchParams.set("redirect_to", redirectTo);
  }

  return magicLinkUrl.toString();
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      {
        status: 400,
      },
    );
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json(
      { error: "Invalid request body" },
      {
        status: 400,
      },
    );
  }

  const { email: rawEmail } = body as { email?: unknown };

  if (typeof rawEmail !== "string") {
    return NextResponse.json(
      { error: "Email is required" },
      {
        status: 400,
      },
    );
  }

  const email = normalizeEmail(rawEmail);

  if (!EMAIL_REGEX.test(email)) {
    return NextResponse.json(
      { error: "A valid email address is required" },
      {
        status: 400,
      },
    );
  }

  const redirectTo = sanitizeRedirect(
    (body as { redirectTo?: unknown; redirect_to?: unknown }).redirectTo ??
      (body as { redirectTo?: unknown; redirect_to?: unknown }).redirect_to,
  );

  let supabaseClient;

  try {
    supabaseClient = getSupabaseAdminClient();
  } catch (error) {
    console.error("Supabase client misconfiguration", error);
    return NextResponse.json(
      { error: "Supabase client is not configured" },
      {
        status: 500,
      },
    );
  }

  let supabaseUserId: string | null = null;

  try {
    const { data, error } = await supabaseClient.auth.admin.createUser({
      email,
      email_confirm: true,
    });

    if (error) {
      if (error instanceof AuthApiError && error.status === 422) {
        supabaseUserId = null;
      } else {
        throw error;
      }
    } else {
      supabaseUserId = data.user?.id ?? null;
    }
  } catch (error) {
    if (error instanceof AuthApiError && error.status === 422) {
      // user already exists - nothing else to do
    } else {
      console.error("Failed to ensure Supabase user", error);
      return NextResponse.json(
        { error: "Unable to process magic link request" },
        {
          status: 500,
        },
      );
    }
  }

  const token = randomBytes(32).toString("hex");
  storeMagicLinkToken(token, { email, redirectTo });

  const originUrl = new URL(request.url).origin;
  const magicLink = buildMagicLink(originUrl, token, redirectTo);

  return NextResponse.json(
    {
      email,
      magicLink,
      expiresIn: Math.floor(MAGIC_LINK_TOKEN_TTL_MS / SECONDS_IN_MS),
      redirectTo,
      userId: supabaseUserId,
    },
    {
      status: 201,
    },
  );
}
