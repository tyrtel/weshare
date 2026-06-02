/**
 * POST /functions/v1/create-payment-link
 *
 * Creates a Stripe Checkout Session for a split request.
 * When STRIPE_SECRET_KEY is not set, returns a mock response so the app
 * runs end-to-end without real Stripe credentials.
 *
 * Security:
 *   - Requires a valid Supabase JWT in the Authorization header.
 *   - Validates the authenticated user is the intended payer.
 *
 * Body: { split_request_id, trip_id, payer_user_id, amount_cents, currency, note }
 * Response: { checkout_url, stripe_session_id, stripe_payment_link_id }
 */

import Stripe from 'npm:stripe@14';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { createUserClient } from '../_shared/supabase.ts';

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
const APP_SCHEME        = Deno.env.get('APP_SCHEME') ?? 'ouishare';

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
    console.warn('[create-payment-link] auth failed:', authError?.message);
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
  }

  try {
    const {
      split_request_id,
      trip_id,
      payer_user_id,
      amount_cents,
      currency,
      note,
    } = await req.json() as {
      split_request_id: string;
      trip_id:          string;
      payer_user_id:    string;
      amount_cents:     number;
      currency:         string;
      note:             string;
    };

    // ── Authorisation: caller must be the intended payer ────────────────────
    if (payer_user_id !== user.id) {
      console.warn('[create-payment-link] user', user.id, 'attempted to create link for payer', payer_user_id);
      return Response.json({ error: 'Forbidden' }, { status: 403, headers: corsHeaders });
    }

    if (!Number.isInteger(amount_cents) || amount_cents <= 0) {
      return Response.json(
        { error: 'amount_cents must be a positive integer' },
        { status: 400, headers: corsHeaders },
      );
    }

    // ── Mock mode (no Stripe key configured) ─────────────────────────────────
    if (!STRIPE_SECRET_KEY) {
      console.log('[create-payment-link] STRIPE_SECRET_KEY not set — returning mock response');
      return Response.json({
        checkout_url:           `${APP_SCHEME}://payment-return?split_request_id=${split_request_id}&status=mock`,
        stripe_session_id:      `mock_cs_${split_request_id}`,
        stripe_payment_link_id: null,
      }, { headers: corsHeaders });
    }

    // ── Real Stripe integration ───────────────────────────────────────────────
    const stripe = new Stripe(STRIPE_SECRET_KEY);

    const successUrl = `${APP_SCHEME}://payment-return?split_request_id=${split_request_id}&status=paid`;
    const cancelUrl  = `${APP_SCHEME}://payment-return?split_request_id=${split_request_id}&status=cancelled`;

    // SEC-17: idempotency key prevents duplicate sessions on network retries.
    const session = await stripe.checkout.sessions.create({
      mode:        'payment',
      success_url: successUrl,
      cancel_url:  cancelUrl,
      line_items:  [{
        price_data: {
          currency:     currency.toLowerCase(),
          unit_amount:  amount_cents,
          product_data: { name: note || 'ouiShare split payment' },
        },
        quantity: 1,
      }],
      metadata: {
        split_request_id,
        trip_id,
        payer_user_id,
      },
      expires_at: Math.floor(Date.now() / 1000) + 86400,
    }, {
      idempotencyKey: split_request_id,
    });

    return Response.json({
      checkout_url:           session.url,
      stripe_session_id:      session.id,
      stripe_payment_link_id: null,
    }, { headers: corsHeaders });

  } catch (err) {
    console.error('[create-payment-link] error:', err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500, headers: corsHeaders },
    );
  }
});
