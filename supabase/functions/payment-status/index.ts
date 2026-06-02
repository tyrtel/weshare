/**
 * GET /functions/v1/payment-status?stripe_session_id=cs_xxx
 *
 * Polls the current status of a Stripe Checkout Session and returns a
 * normalized status string matching our SplitRequestStatus enum.
 *
 * When STRIPE_SECRET_KEY is not set, returns a mock status of 'pending'
 * so polling works in simulation mode.
 */

import Stripe from 'npm:stripe@14';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { createUserClient } from '../_shared/supabase.ts';

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');

function stripeStatusToInternal(session: Stripe.Checkout.Session): string {
  if (session.status === 'complete')   return 'completed';
  if (session.status === 'expired')    return 'expired';
  if (session.payment_status === 'unpaid') return 'pending';
  return 'pending';
}

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  // SEC-14: require a valid Supabase JWT for consistency with other endpoints.
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
    console.warn('[payment-status] auth failed:', authError?.message);
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
  }

  const url             = new URL(req.url);
  const stripeSessionId = url.searchParams.get('stripe_session_id');

  if (!stripeSessionId) {
    return Response.json({ error: 'stripe_session_id is required' }, { status: 400, headers: corsHeaders });
  }

  if (!STRIPE_SECRET_KEY) {
    // Mock mode: return pending so the UI can poll without real keys.
    return Response.json({ status: 'pending', stripe_session_id: stripeSessionId }, { headers: corsHeaders });
  }

  try {
    const stripe  = new Stripe(STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(stripeSessionId);
    const status  = stripeStatusToInternal(session);

    return Response.json({ status, stripe_session_id: stripeSessionId }, { headers: corsHeaders });
  } catch (err) {
    console.error('[payment-status] error:', err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500, headers: corsHeaders },
    );
  }
});
