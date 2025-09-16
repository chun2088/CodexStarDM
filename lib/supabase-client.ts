import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const globalForSupabase = globalThis as unknown as {
  __supabaseAdminClient?: SupabaseClient;
};

function ensureConfig(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`Missing required Supabase environment variable: ${name}`);
  }

  return value;
}

export function getSupabaseAdminClient() {
  const supabaseUrl = ensureConfig("SUPABASE_URL", process.env.SUPABASE_URL);
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
