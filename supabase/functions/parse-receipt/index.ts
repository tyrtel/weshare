/**
 * POST /functions/v1/parse-receipt
 *
 * Sends a receipt image to Claude Haiku 4.5 Vision and returns structured data
 * suitable for pre-filling the AddExpense form.
 *
 * Security:
 *   - Requires a valid Supabase JWT in the Authorization header.
 *   - Enforces a per-user rate limit (default: 20 calls per 60 minutes).
 *   - ANTHROPIC_API_KEY is a server-side Deno secret — never exposed to clients.
 *
 * When ANTHROPIC_API_KEY is not set, returns a mock response so the Edge
 * Function can be exercised in local development without real credentials.
 *
 * Body:     { imageBase64: string, mimeType: 'image/jpeg' | 'image/png' }
 * Response: { merchant, date, currency, totalAmountCents, lineItems }
 */

import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { createAdminClient, createUserClient } from '../_shared/supabase.ts';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL             = 'claude-haiku-4-5-20251001';

// SEC-15: read from env so limits can be adjusted without a redeploy.
const RATE_LIMIT_MAX_CALLS   = Number(Deno.env.get('OCR_RATE_LIMIT_MAX_CALLS')   ?? 20);
const RATE_LIMIT_WINDOW_MINS = Number(Deno.env.get('OCR_RATE_LIMIT_WINDOW_MINS') ?? 60);

// SEC-13: reject payloads larger than ~2 MB of base64 (~1.5 MB image).
const MAX_BASE64_BYTES = 2 * 1024 * 1024;

const SYSTEM_PROMPT = `\
You are a receipt parser. Extract fields from the receipt image and return valid JSON only — no markdown, no explanation.
Return this exact shape:
{
  "merchant": string | null,
  "date": string | null,
  "currency": string,
  "totalAmountCents": number,
  "lineItems": [{ "description": string, "amountCents": number }]
}
Rules:
- All amounts must be integer cents (multiply by 100, round to nearest integer).
- currency must be a 3-letter ISO 4217 code. Default to "EUR" if ambiguous.
- date must be ISO 8601 (YYYY-MM-DD) or null if not visible.
- If you cannot determine totalAmountCents, sum the lineItems amounts.
- Return null for merchant or date if they are not legible.`;

const MOCK_RESPONSE = {
  merchant:          'Café de Flore',
  date:              '2026-05-14',
  currency:          'EUR',
  totalAmountCents:  4750,
  lineItems: [
    { description: 'Croque Monsieur',  amountCents: 1600 },
    { description: 'Café au lait x2', amountCents: 1400 },
    { description: 'Tarte Tatin',      amountCents: 1750 },
  ],
};

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  // ── Auth: require a valid Supabase JWT ──────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return Response.json(
      { error: 'Missing or invalid Authorization header' },
      { status: 401, headers: corsHeaders },
    );
  }

  const userClient = createUserClient(authHeader);
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    console.warn('[parse-receipt] auth failed:', authError?.message);
    return Response.json(
      { error: 'Unauthorized' },
      { status: 401, headers: corsHeaders },
    );
  }

  // ── Rate limit: max N calls per window per user ─────────────────────────────
  const adminClient = createAdminClient();
  const { data: allowed, error: rlError } = await adminClient.rpc('check_ocr_rate_limit', {
    p_user_id:     user.id,
    p_max_calls:   RATE_LIMIT_MAX_CALLS,
    p_window_mins: RATE_LIMIT_WINDOW_MINS,
  });

  if (rlError) {
    console.error('[parse-receipt] rate-limit check failed:', rlError.message);
    // Fail open on DB errors rather than blocking all users.
  } else if (!allowed) {
    console.warn('[parse-receipt] rate limit exceeded for user:', user.id);
    return Response.json(
      { error: `Rate limit exceeded — maximum ${RATE_LIMIT_MAX_CALLS} scans per ${RATE_LIMIT_WINDOW_MINS} minutes` },
      { status: 429, headers: { ...corsHeaders, 'Retry-After': String(RATE_LIMIT_WINDOW_MINS * 60) } },
    );
  }

  // ── Parse request body ──────────────────────────────────────────────────────
  try {
    const { imageBase64, mimeType } = await req.json() as {
      imageBase64: string;
      mimeType: 'image/jpeg' | 'image/png';
    };

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return Response.json(
        { error: 'imageBase64 is required' },
        { status: 400, headers: corsHeaders },
      );
    }

    // SEC-13: enforce payload size limit before sending to Anthropic.
    if (imageBase64.length > MAX_BASE64_BYTES) {
      return Response.json(
        { error: `Image too large — maximum ${MAX_BASE64_BYTES / (1024 * 1024)} MB` },
        { status: 413, headers: corsHeaders },
      );
    }

    if (mimeType !== 'image/jpeg' && mimeType !== 'image/png') {
      return Response.json(
        { error: 'mimeType must be image/jpeg or image/png' },
        { status: 400, headers: corsHeaders },
      );
    }

    // ── Mock mode (no Anthropic key configured) ─────────────────────────────
    if (!ANTHROPIC_API_KEY) {
      console.log('[parse-receipt] ANTHROPIC_API_KEY not set — returning mock response');
      return Response.json(MOCK_RESPONSE, { headers: corsHeaders });
    }

    // ── Real Claude Haiku 4.5 integration ───────────────────────────────────
    console.log('[parse-receipt] calling Claude for user:', user.id, { mimeType, base64Length: imageBase64.length });

    const anthropicResponse = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key':         ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:      MODEL,
        max_tokens: 1024,
        system:     SYSTEM_PROMPT,
        messages: [{
          role:    'user',
          content: [
            {
              type:   'image',
              source: {
                type:       'base64',
                media_type: mimeType,
                data:       imageBase64,
              },
            },
            {
              type: 'text',
              text: 'Parse this receipt.',
            },
          ],
        }],
      }),
    });

    if (!anthropicResponse.ok) {
      const errBody = await anthropicResponse.text();
      console.error('[parse-receipt] Anthropic API error:', errBody);
      return Response.json(
        { error: 'Receipt parsing failed — upstream API error' },
        { status: 502, headers: corsHeaders },
      );
    }

    const anthropicData = await anthropicResponse.json() as {
      content: Array<{ type: string; text: string }>;
    };

    const rawText = anthropicData.content.find((b) => b.type === 'text')?.text ?? '';

    // Claude occasionally wraps its JSON in a markdown code fence despite being
    // told not to. Strip ```json ... ``` or ``` ... ``` before parsing.
    const jsonText = rawText.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      // SEC-18: truncate to avoid logging receipt contents (prices, merchant names).
      console.error('[parse-receipt] Claude returned non-JSON:', rawText.slice(0, 80) + '…');
      return Response.json(
        { error: 'Receipt parsing failed — could not read response' },
        { status: 502, headers: corsHeaders },
      );
    }

    console.log('[parse-receipt] success for user:', user.id);
    return Response.json(parsed, { headers: corsHeaders });

  } catch (err) {
    console.error('[parse-receipt] error:', err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500, headers: corsHeaders },
    );
  }
});
