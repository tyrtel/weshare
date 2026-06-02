/**
 * GET /functions/v1/ob-status?ob_payment_id=xxx&ob_provider=tink
 *
 * Polls the OB aggregator for the current payment status.
 * Returns our internal SplitRequestStatus string.
 *
 * When TINK_CLIENT_ID is not set, returns 'pending' as a mock.
 */

import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { tinkGetPaymentStatus, tinkStatusToInternal } from '../_shared/tink.ts';

const TINK_CLIENT_ID     = Deno.env.get('TINK_CLIENT_ID');
const TINK_CLIENT_SECRET = Deno.env.get('TINK_CLIENT_SECRET');

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const url        = new URL(req.url);
    const paymentId  = url.searchParams.get('ob_payment_id');
    const provider   = url.searchParams.get('ob_provider') ?? 'tink';

    if (!paymentId) {
      return Response.json({ error: 'ob_payment_id is required' }, { status: 400, headers: corsHeaders });
    }

    // ── Mock mode ─────────────────────────────────────────────────────────────
    if (!TINK_CLIENT_ID || !TINK_CLIENT_SECRET) {
      return Response.json({
        status:        'pending',
        ob_payment_id: paymentId,
        ob_provider:   provider,
      }, { headers: corsHeaders });
    }

    // ── Real Tink status poll ─────────────────────────────────────────────────
    const tinkResponse = await tinkGetPaymentStatus(TINK_CLIENT_ID, TINK_CLIENT_SECRET, paymentId);
    const status       = tinkStatusToInternal(tinkResponse.status);

    return Response.json({
      status,
      ob_payment_id: paymentId,
      ob_provider:   provider,
    }, { headers: corsHeaders });

  } catch (err) {
    console.error('[ob-status] error:', err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500, headers: corsHeaders },
    );
  }
});
