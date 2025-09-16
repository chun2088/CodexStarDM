const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

// Load environment variables from the default .env file when available.
dotenv.config();

const REQUIRED_VARS = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'];
const missing = REQUIRED_VARS.filter((key) => !process.env[key]);

if (missing.length > 0) {
  throw new Error(`Missing required Supabase environment variables: ${missing.join(', ')}`);
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: true,
  },
  global: {
    headers: {
      'X-Client-Info': 'CodexStarDM Public Client',
    },
  },
});

let serviceRoleClient;
if (supabaseServiceRoleKey) {
  serviceRoleClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        'X-Client-Info': 'CodexStarDM Service Role Client',
      },
    },
  });
}

module.exports = {
  supabase,
  supabaseUrl,
  supabaseAnonKey,
  getServiceRoleClient: () => {
    if (!supabaseServiceRoleKey) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured in the environment.');
    }

    return serviceRoleClient;
  },
};
