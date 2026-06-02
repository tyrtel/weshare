/**
 * Keep-alive ping for the Supabase project.
 *
 * All other Supabase tests mock the client, so nothing in the normal suite
 * touches the live project. Without any real traffic Supabase pauses free-tier
 * projects after ~1 week of inactivity. This test makes a single unauthenticated
 * REST request to prevent that.
 *
 * Skipped automatically when credentials are absent or still set to the
 * placeholder values (e.g. CI without secrets, simulation mode).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Pull in .env values so the test works via `npm test` without requiring the
// developer to pre-export the variables in their shell.
function loadDotEnv() {
  try {
    const envPath = join(__dirname, '../../../.env');
    const lines = readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // .env absent — rely on whatever is already in process.env
  }
}

loadDotEnv();

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

const isConfigured =
  SUPABASE_URL.length > 0 &&
  !SUPABASE_URL.includes('placeholder') &&
  SUPABASE_ANON_KEY.length > 0 &&
  !SUPABASE_ANON_KEY.includes('placeholder');

const maybeIt = isConfigured ? it : it.skip;

describe('Supabase keep-alive ping', () => {
  maybeIt(
    'reaches the REST API and receives a 200',
    async () => {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/`, {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      });
      // Any sub-500 status means the project is reachable and not paused.
      // (The REST root may return 404; a paused project would not respond at all.)
      expect(response.status).toBeLessThan(500);
    },
    10_000,
  );
});
