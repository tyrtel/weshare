// SEC-12: restrict to the configured web origin in production.
// Set APP_WEB_ORIGIN in Supabase secrets (e.g. https://app.ouishare.com).
// Falls back to '*' when unset so local dev and the native-only app still work.
const ALLOWED_ORIGIN = Deno.env.get('APP_WEB_ORIGIN') ?? '*';

export const corsHeaders = {
  'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  return null;
}
