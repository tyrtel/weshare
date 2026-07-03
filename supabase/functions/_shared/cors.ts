// SEC-12: restrict to the configured web origin in production.
// Set APP_WEB_ORIGIN in Supabase project secrets (e.g. https://app.ouishare.com).
// When unset, no Access-Control-Allow-Origin header is emitted — browsers then
// block cross-origin requests by default, which is the safe fallback.
// Native (iOS/Android) clients do not use CORS and are unaffected either way.
const ALLOWED_ORIGIN = Deno.env.get('APP_WEB_ORIGIN');

export const corsHeaders: Record<string, string> = {
  ...(ALLOWED_ORIGIN ? { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN } : {}),
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  return null;
}
