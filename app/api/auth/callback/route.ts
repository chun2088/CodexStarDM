import { AuthApiError } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { recordEvent } from "@/lib/event-service";
import { getSupabaseAdminClient } from "@/lib/supabase-client";
import { consumeMagicLinkToken } from "@/lib/token-store";

const DEFAULT_REDIRECT_PATH = "/";
const ACCESS_TOKEN_COOKIE_NAME = "sb-access-token";
const REFRESH_TOKEN_COOKIE_NAME = "sb-refresh-token";
const REFRESH_TOKEN_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return NextResponse.json(
      { error: "Missing token" },
      {
        status: 400,
      },
    );
  }

  let consumed;

  try {
    consumed = await consumeMagicLinkToken(token);
  } catch (error) {
    console.error("Failed to verify magic link token", error);
    return NextResponse.json(
      { error: "Unable to verify token" },
      {
        status: 500,
      },
    );
  }

  if (!consumed) {
    return NextResponse.json(
      { error: "Invalid or expired token" },
      {
        status: 400,
      },
    );
  }

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
      email: consumed.email,
      email_confirm: true,
    });

    if (error) {
      if (!(error instanceof AuthApiError && error.status === 422)) {
        throw error;
      }
    } else {
      supabaseUserId = data.user?.id ?? null;
    }
  } catch (error) {
    if (error instanceof AuthApiError && error.status === 422) {
      // user already exists
    } else {
      console.error("Failed to ensure Supabase user", error);
      return NextResponse.json(
        { error: "Unable to finalize login" },
        {
          status: 500,
        },
      );
    }
  }

  let hashedTokenForSession: string | null = null;
  let session;
  let sessionUser;

  try {
    const { data: generated, error: generateError } = await supabaseClient.auth.admin.generateLink({
      type: "magiclink",
      email: consumed.email,
    });

    if (generateError) {
      throw generateError;
    }

    const generatedProperties = generated?.properties ?? null;
    hashedTokenForSession = generatedProperties?.hashed_token ?? null;

    if (!hashedTokenForSession) {
      throw new Error("Supabase did not return a hashed token");
    }

    const { data: verifyData, error: verifyError } = await supabaseClient.auth.verifyOtp({
      type: "magiclink",
      token_hash: hashedTokenForSession,
    });

    if (verifyError) {
      throw verifyError;
    }

    session = verifyData.session;
    sessionUser = verifyData.user ?? generated?.user ?? null;

    if (!session || !session.access_token || !session.refresh_token) {
      throw new Error("Supabase did not return a valid session");
    }
  } catch (error) {
    console.error("Failed to establish Supabase session", error);
    return NextResponse.json(
      { error: "Unable to complete login" },
      {
        status: 500,
      },
    );
  }

  const redirectFromToken = sanitizeRedirect(consumed.redirectTo);
  const redirectFromQuery = sanitizeRedirect(url.searchParams.get("redirect_to"));
  const redirectPath = redirectFromToken ?? redirectFromQuery ?? DEFAULT_REDIRECT_PATH;
  const redirectUrl = new URL(redirectPath, url.origin);

  const response = NextResponse.redirect(redirectUrl, { status: 302 });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("X-Supabase-Access-Token", session.access_token);
  response.headers.set("X-Supabase-Refresh-Token", session.refresh_token);

  const secureCookies = process.env.NODE_ENV === "production";
  const accessTokenTtlSeconds = session.expires_in ?? 3600;

  response.cookies.set({
    name: ACCESS_TOKEN_COOKIE_NAME,
    value: session.access_token,
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookies,
    maxAge: accessTokenTtlSeconds,
    path: "/",
  });

  response.cookies.set({
    name: REFRESH_TOKEN_COOKIE_NAME,
    value: session.refresh_token,
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookies,
    maxAge: REFRESH_TOKEN_MAX_AGE_SECONDS,
    path: "/",
  });

  const eventUserId = sessionUser?.id ?? supabaseUserId;
  const sessionExpiresAt = new Date(Date.now() + accessTokenTtlSeconds * 1000).toISOString();

  try {
    await recordEvent(supabaseClient, {
      type: "auth.magic_link.consumed",
      source: "api/auth/callback",
      context: {
        email: consumed.email,
        userId: eventUserId,
      },
      details: {
        redirectTo: redirectPath,
        tokenId: consumed.id,
        tokenMetadata: consumed.metadata,
        hashedToken: hashedTokenForSession,
        sessionExpiresAt,
      },
    });
  } catch (error) {
    console.error("Failed to record magic link consumption event", error);
  }

  return response;
}
