/**
 * POST /functions/v1/stripe-webhook
 *
 * Receives Stripe webhook events and updates split_request status accordingly.
 * Uses the Supabase service-role key so it can bypass RLS and update any row.
 *
 * Required env vars:
 *   STRIPE_SECRET_KEY       — Stripe secret key
 *   STRIPE_WEBHOOK_SECRET   — from Stripe Dashboard > Webhooks > Signing secret
 *   SUPABASE_URL            — injected automatically by Supabase
 *   SUPABASE_SERVICE_ROLE_KEY — injected automatically by Supabase
 */

import Stripe from 'npm:stripe@14';
import { corsHeaders } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/supabase.ts';

const STRIPE_SECRET_KEY     = Deno.env.get('STRIPE_SECRET_KEY');
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET');

// Maps Stripe event types to our internal status.
const EVENT_STATUS: Record<string, string> = {
  'checkout.session.completed':      'completed',
  'checkout.session.expired':        'expired',
  'payment_intent.payment_failed':   'declined',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
    console.warn('[stripe-webhook] Stripe keys not configured — ignoring event');
    return Response.json({ received: true }, { headers: corsHeaders });
  }

  const stripe    = new Stripe(STRIPE_SECRET_KEY);
  const signature = req.headers.get('stripe-signature') ?? '';
  const body      = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[stripe-webhook] signature verification failed:', err);
    return Response.json({ error: 'Invalid signature' }, { status: 400, headers: corsHeaders });
  }

  const nextStatus = EVENT_STATUS[event.type];
  if (!nextStatus) {
    // Not an event we handle — acknowledge and move on.
    return Response.json({ received: true }, { headers: corsHeaders });
  }

  // Extract split_request_id from the event metadata.
  const session          = event.data.object as Stripe.Checkout.Session;
  const splitRequestId   = session.metadata?.split_request_id;

  if (!splitRequestId) {
    console.warn('[stripe-webhook] event has no split_request_id in metadata', event.id);
    return Response.json({ received: true }, { headers: corsHeaders });
  }

  // Update the split request using the admin (service-role) client.
  const supabase = createAdminClient();
  const { error } = await supabase
    .from('split_requests')
    .update({ status: nextStatus, updated_at: new Date().toISOString() })
    .eq('id', splitRequestId);

  if (error) {
    // SEC-7: log details server-side only, return generic message to caller.
    console.error('[stripe-webhook] failed to update split_request:', error.message);
    return Response.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders });
  }

  console.log(`[stripe-webhook] ${event.type} → split_request ${splitRequestId} = ${nextStatus}`);

  // Fire-and-forget audit log insert — failure must not fail the webhook response.
  supabase.from('audit_log').insert({
    entity_type: 'split_request',
    entity_id:   splitRequestId,
    event_type:  event.type,
    payload: {
      stripe_event_id: event.id,
      next_status:     nextStatus,
    },
  }).then(({ error: auditError }) => {
    if (auditError) console.warn('[stripe-webhook] audit log insert failed:', auditError.message);
  });

  return Response.json({ received: true }, { headers: corsHeaders });
});
