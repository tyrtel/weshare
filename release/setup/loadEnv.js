const fs = require('fs');
const path = require('path');

const env = JSON.parse(fs.readFileSync(path.join(__dirname, '.local-env.json'), 'utf8'));

// These tests create users and write data. Refuse anything but a local stack so
// a stray env var can never point them at production.
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(env.url)) {
  throw new Error(`[release] Refusing to run against non-local Supabase URL: ${env.url}`);
}

// Read by src/infrastructure/supabase/supabaseClient.ts at import time.
process.env.EXPO_PUBLIC_SUPABASE_URL      = env.url;
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = env.anonKey;
process.env.RELEASE_SERVICE_ROLE_KEY      = env.serviceRoleKey;
