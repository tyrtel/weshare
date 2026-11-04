const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const SUPABASE = path.join(ROOT, 'node_modules', '.bin', 'supabase');
const ENV_FILE = path.join(__dirname, '.local-env.json');

function supabase(args, stdio = 'pipe') {
  return execFileSync(SUPABASE, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', stdio, stdio] });
}

function status() {
  try {
    return JSON.parse(supabase(['status', '-o', 'json']));
  } catch {
    return null;
  }
}

// `db reset` restarts the API containers; wait until PostgREST and GoTrue both
// answer so the first tests don't hit a 502 from the gateway.
async function waitForApi(local) {
  const headers = { apikey: local.ANON_KEY };
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const [rest, auth] = await Promise.all([
        fetch(`${local.API_URL}/rest/v1/`, { headers }),
        fetch(`${local.API_URL}/auth/v1/health`, { headers }),
      ]);
      if (rest.ok && auth.ok) return;
    } catch {
      // containers still coming up
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error('[release] Local Supabase API did not become ready within 60s');
}

// Starts the local stack if needed and resets the database so every run
// replays all migrations onto an empty schema. RELEASE_SKIP_RESET=1 reuses the
// current database for quicker iteration on a single test.
module.exports = async function globalSetup() {
  let local = status();
  if (!local) {
    console.log('\n[release] Starting local Supabase (first run pulls Docker images)…');
    supabase(['start'], 'inherit');
    local = status();
  }
  if (!local) throw new Error('[release] Local Supabase did not start. Is Docker running?');

  if (process.env.RELEASE_SKIP_RESET !== '1') {
    console.log('\n[release] Resetting local database and replaying migrations…');
    supabase(['db', 'reset', '--local']);
  }
  await waitForApi(local);

  fs.writeFileSync(ENV_FILE, JSON.stringify({
    url:            local.API_URL,
    anonKey:        local.ANON_KEY,
    serviceRoleKey: local.SERVICE_ROLE_KEY,
  }));
};
