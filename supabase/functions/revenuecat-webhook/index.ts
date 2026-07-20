/**
 * POST /functions/v1/revenuecat-webhook
 *
 * Receives RevenueCat webhook events and writes trip_passes / subscription_windows
 * rows using the Supabase service-role key (bypasses RLS). Idempotent on
 * store_transaction_id (RevenueCat, like Stripe, does not guarantee exactly-once
 * delivery).
 *
 * Required env vars:
 *   REVENUECAT_WEBHOOK_AUTH_HEADER — shared secret, set to exactly the string
 *     configured as the "Authorization header value" in RevenueCat Dashboard >
 *     Project > Integrations > Webhooks. RevenueCat does not sign webhooks the
 *     way Stripe/Tink do — this is a plain shared-secret header comparison.
 *   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — injected automatically by Supabase
 *
 * Set ALLOW_UNSIGNED_WEBHOOKS=true only for local sandbox testing (mirrors ob-webhook).
 */

import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/supabase.ts';

const REVENUECAT_WEBHOOK_AUTH_HEADER = Deno.env.get('REVENUECAT_WEBHOOK_AUTH_HEADER');
const ALLOW_UNSIGNED_WEBHOOKS        = Deno.env.get('ALLOW_UNSIGNED_WEBHOOKS') === 'true';

// Store product identifiers — must match RevenueCatEntitlementService.ts and
// TODO_monetization.md's Product Catalog.
const TRIP_PASS_PRODUCT_ID       = 'trip_pass_single';
const PREMIUM_MONTHLY_PRODUCT_ID = 'premium_monthly';
const TRIP_PASS_DURATION_MS      = 30 * 24 * 60 * 60 * 1000;

// Subscriber attribute set by RevenueCatEntitlementService.purchaseTripPass()
// immediately before the purchase call — the only way to carry our own tripId
// through a one-time purchase, since its receipt has no product-level custom
// metadata of its own.
const PENDING_TRIP_PASS_ATTRIBUTE = 'pending_trip_pass_trip_id';

// Events that mean "this user has access through this expiration." Each one
// writes the store's own expiration_at_ms straight into subscription_windows
// — see TODO_monetization.md's "Rolling window" decision: this mirrors
// RevenueCat's EntitlementInfo.expirationDate directly rather than
// recomputing renewal math ourselves, since the store's billing cycle is
// already the authoritative clock for a real auto-renewing subscription.
// CANCELLATION/EXPIRATION need no handling — access already tracks the
// existing expires_at naturally as real time passes.
//
// BILLING_ISSUE (a failed renewal charge) is a grant event too, not just an
// acknowledgement: RevenueCat still sends expiration_at_ms on this event,
// reflecting the store's grace-period extension (e.g. Google Play's account
// hold) if one applies. Writing that expiry the same way as a RENEWAL keeps
// access alive through the grace window with no extra state machine — if the
// billing issue is never resolved, expiration_at_ms simply isn't extended
// again and access reverts once it naturally passes, same as CANCELLATION.
const SUBSCRIPTION_GRANT_EVENTS = new Set(['INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'PRODUCT_CHANGE', 'BILLING_ISSUE']);

interface RevenueCatEvent {
  type: string;
  app_user_id: string;
  product_id: string;
  transaction_id: string;
  purchased_at_ms: number;
  expiration_at_ms: number | null;
  subscriber_attributes?: Record<string, { value: string; updated_at_ms: number }>;
}

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

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (!REVENUECAT_WEBHOOK_AUTH_HEADER) {
    if (!ALLOW_UNSIGNED_WEBHOOKS) {
      console.error('[revenuecat-webhook] REVENUECAT_WEBHOOK_AUTH_HEADER is not set and ALLOW_UNSIGNED_WEBHOOKS is not enabled — rejecting request');
      return new Response('Internal server error', { status: 500 });
    }
    console.warn('[revenuecat-webhook] ALLOW_UNSIGNED_WEBHOOKS=true — skipping auth check (dev/sandbox only)');
  } else {
    const received = req.headers.get('authorization') ?? '';
    if (!timingSafeEqual(received, REVENUECAT_WEBHOOK_AUTH_HEADER)) {
      console.warn('[revenuecat-webhook] invalid Authorization header');
      return new Response('Unauthorized', { status: 401 });
    }
  }

  let event: RevenueCatEvent;
  try {
    const body = JSON.parse(await req.text()) as { event: RevenueCatEvent };
    event = body.event;
  } catch (parseErr) {
    console.error('[revenuecat-webhook] invalid JSON body:', parseErr);
    return Response.json({ error: 'Invalid body' }, { status: 400, headers: corsHeaders });
  }

  const supabase = createAdminClient();

  if (event.product_id === TRIP_PASS_PRODUCT_ID && event.type === 'NON_RENEWING_PURCHASE') {
    const tripId = event.subscriber_attributes?.[PENDING_TRIP_PASS_ATTRIBUTE]?.value;
    if (!tripId) {
      console.warn('[revenuecat-webhook] trip pass purchase with no pending_trip_pass_trip_id attribute:', event.transaction_id);
      return Response.json({ received: true }, { headers: corsHeaders });
    }

    const purchasedAt = new Date(event.purchased_at_ms);
    const { error } = await supabase.from('trip_passes').upsert({
      user_id:              event.app_user_id,
      trip_id:               tripId,
      purchased_at:          purchasedAt.toISOString(),
      expires_at:            new Date(purchasedAt.getTime() + TRIP_PASS_DURATION_MS).toISOString(),
      store_transaction_id:  event.transaction_id,
    }, { onConflict: 'store_transaction_id', ignoreDuplicates: true });

    if (error) {
      console.error('[revenuecat-webhook] trip_passes upsert failed:', error.message);
      return Response.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders });
    }

    console.log(`[revenuecat-webhook] trip pass granted: user ${event.app_user_id}, trip ${tripId}`);
  } else if (event.product_id === PREMIUM_MONTHLY_PRODUCT_ID && SUBSCRIPTION_GRANT_EVENTS.has(event.type)) {
    if (!event.expiration_at_ms) {
      console.warn('[revenuecat-webhook] subscription event with no expiration_at_ms:', event.transaction_id);
      return Response.json({ received: true }, { headers: corsHeaders });
    }

    const { error } = await supabase.from('subscription_windows').upsert({
      user_id:               event.app_user_id,
      started_at:            new Date(event.purchased_at_ms).toISOString(),
      expires_at:            new Date(event.expiration_at_ms).toISOString(),
      store_transaction_id:  event.transaction_id,
    }, { onConflict: 'store_transaction_id', ignoreDuplicates: true });

    if (error) {
      console.error('[revenuecat-webhook] subscription_windows upsert failed:', error.message);
      return Response.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders });
    }

    console.log(`[revenuecat-webhook] subscription window granted: user ${event.app_user_id}, expires ${new Date(event.expiration_at_ms).toISOString()}`);
  } else {
    // Not an event we act on (CANCELLATION/EXPIRATION/BILLING_ISSUE/other
    // products) — acknowledge and move on.
    return Response.json({ received: true }, { headers: corsHeaders });
  }

  // Fire-and-forget audit log insert — failure must not fail the webhook response.
  supabase.from('audit_log').insert({
    entity_type: 'entitlement',
    entity_id:   event.app_user_id,
    event_type:  `revenuecat.${event.type.toLowerCase()}`,
    payload: {
      revenuecat_transaction_id: event.transaction_id,
      product_id:                event.product_id,
    },
  }).then(({ error: auditError }) => {
    if (auditError) console.warn('[revenuecat-webhook] audit log insert failed:', auditError.message);
  });

  return Response.json({ received: true }, { headers: corsHeaders });
});
