import { AuthApiError } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { getSupabaseAdminClient } from "@/lib/supabase-client";
import { consumeMagicLinkToken } from "@/lib/token-store";

const DEFAULT_REDIRECT_PATH = "/";

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

  const consumed = consumeMagicLinkToken(token);

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

  try {
    const { error } = await supabaseClient.auth.admin.createUser({
      email: consumed.email,
      email_confirm: true,
    });

    if (error && !(error instanceof AuthApiError && error.status === 422)) {
      throw error;
    }
  } catch (error) {
    console.error("Failed to finalize Supabase user", error);
    return NextResponse.json(
      { error: "Unable to finalize login" },
      {
        status: 500,
      },
    );
  }

  return NextResponse.json(
    {
      message: "Magic link verified",
      email: consumed.email,
      redirectTo: consumed.redirectTo ?? DEFAULT_REDIRECT_PATH,
    },
    {
      status: 200,
    },
  );
}
