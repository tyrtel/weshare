/**
 * POST /functions/v1/ob-webhook
 *
 * Receives status callbacks from the Tink aggregator and updates split_requests.
 * Tink signs requests with HMAC-SHA256 using the webhook secret.
 *
 * TINK_WEBHOOK_SECRET must be set in production. If it is absent the function
 * returns 500 (misconfiguration) rather than proceeding unsigned.
 * Set ALLOW_UNSIGNED_WEBHOOKS=true only for local sandbox testing.
 */

import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/supabase.ts';
import { tinkStatusToInternal, type TinkPaymentStatus } from '../_shared/tink.ts';

const TINK_WEBHOOK_SECRET    = Deno.env.get('TINK_WEBHOOK_SECRET');
const ALLOW_UNSIGNED_WEBHOOKS = Deno.env.get('ALLOW_UNSIGNED_WEBHOOKS') === 'true';

// SEC-9: constant-time comparison to prevent timing-oracle attacks.
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab  = enc.encode(a);
  const bb  = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

async function verifyTinkSignature(
  body: string,
  signatureHeader: string | null,
  secret: string,
): Promise<boolean> {
  if (!signatureHeader) return false;

  const encoder   = new TextEncoder();
  const keyData   = encoder.encode(secret);
  const msgData   = encoder.encode(body);
  const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sigBuffer = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
  const computed  = Array.from(new Uint8Array(sigBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  // Tink sends "sha256=<hex>" or just "<hex>" depending on API version.
  const received = signatureHeader.replace(/^sha256=/, '');
  return timingSafeEqual(computed, received);
}

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const rawBody = await req.text();

  // ── SEC-6: signature verification ─────────────────────────────────────────
  if (!TINK_WEBHOOK_SECRET) {
    if (!ALLOW_UNSIGNED_WEBHOOKS) {
      console.error('[ob-webhook] TINK_WEBHOOK_SECRET is not set and ALLOW_UNSIGNED_WEBHOOKS is not enabled — rejecting request');
      return new Response('Internal server error', { status: 500 });
    }
    console.warn('[ob-webhook] ALLOW_UNSIGNED_WEBHOOKS=true — skipping signature check (dev/sandbox only)');
  } else {
    const sig   = req.headers.get('x-tink-signature');
    const valid = await verifyTinkSignature(rawBody, sig, TINK_WEBHOOK_SECRET);
    if (!valid) {
      console.warn('[ob-webhook] invalid Tink signature');
      return new Response('Unauthorized', { status: 401 });
    }
  }

  try {
    const event = JSON.parse(rawBody) as {
      event:   string;
      payment: { id: string; status: string };
    };

    const { id: obPaymentId, status: rawStatus } = event.payment;
    const internalStatus = tinkStatusToInternal(rawStatus as TinkPaymentStatus);

    const supabase = createAdminClient();
    const { error } = await supabase
      .from('split_requests')
      .update({ status: internalStatus, updated_at: new Date().toISOString() })
      .eq('ob_payment_id', obPaymentId);

    if (error) {
      // SEC-7: log details server-side only, return generic message to caller.
      console.error('[ob-webhook] db update error:', error.message);
      return Response.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders });
    }

    console.log(`[ob-webhook] ${obPaymentId} → ${internalStatus}`);
    return Response.json({ received: true, status: internalStatus }, { headers: corsHeaders });

  } catch (err) {
    console.error('[ob-webhook] parse/update error:', err);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders },
    );
  }
});
