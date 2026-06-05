/**
 * POST /functions/v1/ob-initiate
 *
 * Initiates a SEPA bank transfer via Tink PIS.
 * When TINK_CLIENT_ID is not set, returns a mock authorization URL so the
 * app runs end-to-end in development without real Tink credentials.
 *
 * Security:
 *   - Requires a valid Supabase JWT in the Authorization header.
 *   - Validates the authenticated user is the payer on the referenced split_request
 *     by looking it up server-side — the client cannot forge ownership.
 *
 * Body: { split_request_id, amount_cents, currency, note, creditor_iban }
 * Response: { authorization_url, ob_payment_id, ob_provider }
 */

import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { createAdminClient, createUserClient } from '../_shared/supabase.ts';
import { tinkInitiatePayment } from '../_shared/tink.ts';

const TINK_CLIENT_ID     = Deno.env.get('TINK_CLIENT_ID');
const TINK_CLIENT_SECRET = Deno.env.get('TINK_CLIENT_SECRET');
const TINK_REDIRECT_URI  = Deno.env.get('TINK_REDIRECT_URI') ?? 'ouishare://ob-return';
const TINK_MARKET        = Deno.env.get('TINK_MARKET') ?? 'FR';
const APP_SCHEME         = Deno.env.get('APP_SCHEME') ?? 'ouishare';

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
    console.warn('[ob-initiate] auth failed:', authError?.message);
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
  }

  try {
    const {
      split_request_id,
      amount_cents,
      currency,
      note,
      creditor_iban,
      provider_id,
    } = await req.json() as {
      split_request_id: string;
      amount_cents:     number;
      currency:         string;
      note:             string;
      creditor_iban:    string;
      provider_id?:     string;  // optional Tink financialInstitutionId from BankSelectorSheet
    };

    // ── Authorisation: verify caller is the payer on the split_request ───────
    // Look up server-side so the client cannot forge the payer_user_id.
    const adminClient = createAdminClient();
    const { data: splitRequest, error: srError } = await adminClient
      .from('split_requests')
      .select('payer_user_id')
      .eq('id', split_request_id)
      .single();

    if (srError || !splitRequest) {
      return Response.json({ error: 'Split request not found' }, { status: 404, headers: corsHeaders });
    }
    if (splitRequest.payer_user_id !== user.id) {
      console.warn('[ob-initiate] user', user.id, 'attempted to pay for split_request owned by', splitRequest.payer_user_id);
      return Response.json({ error: 'Forbidden' }, { status: 403, headers: corsHeaders });
    }

    if (!Number.isInteger(amount_cents) || amount_cents <= 0) {
      return Response.json(
        { error: 'amount_cents must be a positive integer' },
        { status: 400, headers: corsHeaders },
      );
    }

    // ── Mock mode (no Tink credentials configured) ────────────────────────────
    if (!TINK_CLIENT_ID || !TINK_CLIENT_SECRET) {
      console.log('[ob-initiate] Tink credentials not set — returning mock response');
      const mockPaymentId = `mock_tink_${split_request_id}`;

      await adminClient
        .from('split_requests')
        .update({
          ob_payment_id: mockPaymentId,
          ob_provider:   'tink',
          status:        'request_sent',
          updated_at:    new Date().toISOString(),
        })
        .eq('id', split_request_id);

      return Response.json({
        authorization_url: `${APP_SCHEME}://ob-return?split_request_id=${split_request_id}&status=mock`,
        ob_payment_id:     mockPaymentId,
        ob_provider:       'tink',
      }, { headers: corsHeaders });
    }

    // ── Real Tink integration ─────────────────────────────────────────────────
    const initiation = await tinkInitiatePayment(
      TINK_CLIENT_ID,
      TINK_CLIENT_SECRET,
      amount_cents,
      currency,
      note || 'ouiShare split',
      creditor_iban,
      TINK_MARKET,
      TINK_REDIRECT_URI,
      provider_id,
    );

    await adminClient
      .from('split_requests')
      .update({
        ob_payment_id: initiation.id,
        ob_provider:   'tink',
        status:        'request_sent',
        updated_at:    new Date().toISOString(),
      })
      .eq('id', split_request_id);

    return Response.json({
      authorization_url: initiation.authorizationUrl ?? `${APP_SCHEME}://ob-return?split_request_id=${split_request_id}`,
      ob_payment_id:     initiation.id,
      ob_provider:       'tink',
    }, { headers: corsHeaders });

  } catch (err) {
    console.error('[ob-initiate] error:', err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500, headers: corsHeaders },
    );
  }
});
