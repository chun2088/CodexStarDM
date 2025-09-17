import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const globalForSupabase = globalThis as unknown as {
  __supabaseAdminClient?: SupabaseClient;
  __supabaseAnonClient?: SupabaseClient;
};

function ensureConfig(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`Missing required Supabase environment variable: ${name}`);
  }

  return value;
}

function getSupabaseUrl() {
  return ensureConfig("SUPABASE_URL", process.env.SUPABASE_URL);
}

function getSupabaseAnonKey() {
  return ensureConfig("SUPABASE_ANON_KEY", process.env.SUPABASE_ANON_KEY);
}

export function getSupabaseAdminClient() {
  const supabaseUrl = getSupabaseUrl();
  const supabaseServiceRoleKey = ensureConfig(
    "SUPABASE_SERVICE_ROLE_KEY",
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  if (!globalForSupabase.__supabaseAdminClient) {
    globalForSupabase.__supabaseAdminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return globalForSupabase.__supabaseAdminClient;
}

export function getSupabaseAnonClient() {
  const supabaseUrl = getSupabaseUrl();
  const supabaseAnonKey = getSupabaseAnonKey();

  if (!globalForSupabase.__supabaseAnonClient) {
    globalForSupabase.__supabaseAnonClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return globalForSupabase.__supabaseAnonClient;
}

export function createSupabaseRouteHandlerClient() {
  const supabaseUrl = getSupabaseUrl();
  const supabaseAnonKey = getSupabaseAnonKey();

  return createRouteHandlerClient({ cookies }, {
    supabaseUrl,
    supabaseKey: supabaseAnonKey,
    options: {
      auth: {
        persistSession: false,
      },
    },
  });
}
