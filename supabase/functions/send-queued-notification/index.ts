/**
 * POST /functions/v1/send-queued-notification
 *
 * Called by the pg_cron function `process_notification_queue` once per queued
 * row. The pg_cron caller passes the Supabase service-role key as a Bearer
 * token so this function never runs on behalf of a user JWT.
 *
 * Body: { notificationId: string }
 *
 * On success: deletes the row from notification_queue.
 * On failure: increments attempts, applies exponential backoff, sets status
 *             to 'failed' or 'dead' once max_attempts is exhausted.
 */

import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/supabase.ts';

const RESEND_API_KEY      = Deno.env.get('RESEND_API_KEY');
const FROM_EMAIL          = 'WeShare <noreply@ouishare.app>';
const EXPO_PUSH_ENDPOINT  = 'https://exp.host/--/api/v2/push/send';

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  // This function is called by pg_cron with the service-role key, never by
  // an end-user. Verify the key matches so random callers can't trigger sends.
  const authHeader      = req.headers.get('Authorization') ?? '';
  const serviceRoleKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (authHeader !== `Bearer ${serviceRoleKey}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
  }

  const { notificationId } = await req.json() as { notificationId: string };
  if (!notificationId) {
    return Response.json({ error: 'notificationId is required' }, { status: 400, headers: corsHeaders });
  }

  const db = createAdminClient();

  const { data: notif, error: fetchError } = await db
    .from('notification_queue')
    .select('*')
    .eq('id', notificationId)
    .single();

  if (fetchError || !notif) {
    console.error('[send-queued-notification] row not found:', notificationId, fetchError?.message);
    return Response.json({ error: 'Not found' }, { status: 404, headers: corsHeaders });
  }

  try {
    if (notif.channel === 'push') {
      await sendPush(db, notif);
    } else if (notif.channel === 'email') {
      await sendEmail(notif);
    } else {
      throw new Error(`Unsupported channel: ${notif.channel}`);
    }

    // Success — delete the row. The table never accumulates sent history;
    // use notification_sent_log for per-user rate limiting if needed later.
    await db.from('notification_queue').delete().eq('id', notificationId);
    return Response.json({ ok: true }, { headers: corsHeaders });

  } catch (err) {
    const nextAttempts  = (notif.attempts as number) + 1;
    const isDead        = nextAttempts >= (notif.max_attempts as number);
    const backoffMs     = Math.pow(2, notif.attempts as number) * 60_000; // 1→2→4→8→16 min
    const nextAttemptAt = new Date(Date.now() + backoffMs).toISOString();

    await db.from('notification_queue').update({
      status:          isDead ? 'dead' : 'failed',
      attempts:        nextAttempts,
      next_attempt_at: nextAttemptAt,
      last_error:      err instanceof Error ? err.message : String(err),
    }).eq('id', notificationId);

    console.error(`[send-queued-notification] ${notif.channel} send failed (attempt ${nextAttempts}):`, err);
    return Response.json({ ok: false }, { status: 500, headers: corsHeaders });
  }
});

// ── Push via Expo ─────────────────────────────────────────────────────────────

async function sendPush(
  db: ReturnType<typeof createAdminClient>,
  notif: Record<string, unknown>,
): Promise<void> {
  const { data: tokenRows } = await db
    .from('device_tokens')
    .select('token')
    .eq('user_id', notif.user_id as string);

  const tokens = (tokenRows ?? []).map((r: { token: string }) => r.token);
  if (tokens.length === 0) {
    // No registered device; nothing to send. Treat as success so the row is deleted.
    return;
  }

  const payload = notif.payload as Record<string, unknown>;
  const messages = tokens.map((to: string) => ({
    to,
    title: payload.title as string | undefined,
    body:  payload.body  as string | undefined,
    data:  { eventType: notif.event_type },
  }));

  const res = await fetch(EXPO_PUSH_ENDPOINT, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body:    JSON.stringify(messages),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Expo push failed (${res.status}): ${text}`);
  }

  const result = await res.json() as { data: Array<{ status: string; message?: string }> };
  const failures = result.data?.filter(r => r.status !== 'ok') ?? [];
  if (failures.length > 0) {
    throw new Error(`Expo push partial failure: ${JSON.stringify(failures)}`);
  }
}

// ── Email via Resend ──────────────────────────────────────────────────────────

async function sendEmail(notif: Record<string, unknown>): Promise<void> {
  const payload = notif.payload as Record<string, unknown>;

  if (!RESEND_API_KEY) {
    console.log('[send-queued-notification] RESEND_API_KEY not set — skipping email send (mock mode)');
    return;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from:    FROM_EMAIL,
      to:      payload.recipientEmail as string,
      subject: payload.subject        as string,
      html:    payload.html           as string,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend API error (${res.status}): ${text}`);
  }
}
