# Notifications Analysis

**Status:** Pre-implementation analysis  
**Last updated:** July 2026  
**Scope:** In-app push, email, SMS, WhatsApp — evaluated for correctness, scale, and cost

---

## Events That Need Notifications

Before picking channels, here is the complete list of events where notifying users makes sense in WeShare:

| Event | Who gets notified | Urgency |
|---|---|---|
| Added to a group or trip | New member | High |
| Group invite (link/token) | Invitee | High |
| Expense added to group/trip | All members | Medium |
| Recurring expense spawned | All members | Low |
| You owe money (settlement suggested) | Debtor | High |
| Someone paid you | Creditor | High |
| Payment request received (split request) | Payer | High |
| Debt marked as settled by peer | Both parties | Medium |
| Group/trip closed | All members | Low |
| Expense edited or deleted | All members | Low |

Not every event needs every channel. High-urgency events (money movement, invites) justify push and possibly email. Low-urgency events (expense added, group closed) are fine as push-only or in-app-only.

---

## Channel Options

### Channel 1 — Mobile Push Notifications

Push notifications are delivered to the device via Apple Push Notification service (APNs) and Firebase Cloud Messaging (FCM). In an Expo project, there are two approaches:

**Option A: Expo Push Notifications (current default)**

Expo provides a push notification gateway that proxies to APNs and FCM. The library is `expo-notifications`. No separate APNs/FCM credentials are needed in managed workflow — Expo handles them.

- Cost: free, no per-notification charge, no volume cap
- Rate limit: 600 notifications per second per project
- Reliability: depends on Expo's infrastructure; Expo has had outages that blocked notifications
- Control: limited — you cannot see delivery receipts in real time, no A/B testing, no advanced segmentation
- Fit for WeShare now: excellent — zero cost, already the natural choice for an Expo app

**Option B: Direct FCM + APNs**

Bypasses Expo's relay. The app registers device tokens directly, and your server sends to FCM/APNs directly.

- Cost: FCM is free. APNs is free (token-auth requires an Apple Developer account which you already have).
- Rate limit: effectively unlimited (FCM can handle millions of messages/second)
- Reliability: FCM/APNs are Google/Apple infrastructure — more reliable than Expo's relay
- Control: full — delivery receipts, detailed analytics, topic subscriptions
- Effort: requires managing device token registration, token refresh, platform-specific payloads, separate libraries
- Fit for WeShare now: overkill — adds operational complexity for no benefit at current scale. Revisit at ~10k MAU or if Expo reliability becomes an issue.

**Recommendation:** Start with Expo Push. It is free, trivially integrated, and sufficient for early scale. The migration path to direct FCM/APNs later is straightforward (swap the send layer, keep the same event triggers).

---

### Channel 2 — Email

Email is the right channel for:
- Welcome / onboarding messages
- Payment request receipts (something the user wants to save)
- Settlement summaries
- Invite links for non-app users (guests who have not installed the app)

Email is **not** right for: real-time debt notifications where latency matters (push is better).

**Transactional email providers compared:**

| Provider | Free tier | $20/mo | $90/mo | Notes |
|---|---|---|---|---|
| **Resend** | 3k/mo (100/day cap) | 50k/mo | — | Best developer experience; React Email templates; native Supabase integration; doubled Scale pricing in late 2024 |
| **Postmark** | 100/mo | ~10k/mo ($15) | ~50k/mo ($50) | Best deliverability reputation; fast (avg 4s delivery); no marketing emails, transactional-only |
| **SendGrid** | 60-day trial only (free tier removed May 2025) | ~40k/mo ($20) | ~100k/mo ($90) | Highest volume at lowest cost; Twilio ecosystem; more complex to set up |
| **Mailgun** | 1k/mo trial | ~10k/mo ($15) | ~50k/mo ($80) | Good API; reasonable pricing |
| **Brevo** (ex-Sendinblue) | 300/day (9k/mo) | ~20k/mo ($25) | — | Also has SMS and WhatsApp in same platform |

**Recommendation: Resend**

- Best developer experience for a TypeScript/Next.js-adjacent stack
- React Email lets you write templates in JSX — same language as the app
- Native Supabase integration: Supabase can use Resend as the custom SMTP provider, so auth emails (magic links, password resets) go through the same service
- Free tier (3k/month) is enough to start
- $20/month covers 50k emails — sufficient for a long time

**How it works with Supabase:**

Email sending happens in Supabase Edge Functions. An event (expense added, debt owed) triggers a database function or the app calls an Edge Function directly. The Edge Function calls the Resend API with the recipient's email and a template. No separate email server needed.

    // Edge Function example
    import { Resend } from 'npm:resend';
    const resend = new Resend(Deno.env.get('RESEND_API_KEY'));

    await resend.emails.send({
      from: 'WeShare <noreply@ouishare.app>',
      to: member.email,
      subject: `${payerName} owes you ${amount}`,
      html: renderDebtEmail({ payerName, amount, groupName }),
    });

---

### Channel 3 — SMS

SMS is the highest-friction and highest-cost channel. It is also the most reliable for reaching people who do not have the app installed.

**When SMS makes sense for WeShare:**
- Sending invite links to non-app contacts (the person hasn't installed WeShare yet)
- Debt reminder when the user hasn't opened the app in a week and has an outstanding balance

**Providers:**

| Provider | Price per SMS (US) | Price per SMS (France) | Notes |
|---|---|---|---|
| **Twilio** | ~$0.0079 | ~$0.075 | Industry standard; best global coverage; high reliability |
| **Vonage** (ex-Nexmo) | ~$0.0065 | ~$0.065 | Similar to Twilio; slightly cheaper in some markets |
| **Sinch** | ~$0.006 | ~$0.060 | Competitive pricing; strong European coverage |
| **AWS SNS** | ~$0.00645 | ~$0.071 | Cheap at scale; less developer-friendly; no dedicated number |

**Cost reality check:**

At 1,000 group invites per month to French numbers: 1,000 × €0.075 = €75/month. That is real money early in a product's life for a feature that only fires when someone invites a non-app-user by SMS.

**Recommendation for WeShare:**

Defer SMS until there is clear evidence that the invite-by-SMS flow is a significant acquisition path. When you do add it, use Twilio — it has the best Supabase Edge Function integration, reliable delivery, and the operational overhead is low. Gate it behind a feature flag and only fire SMS for invite links, not for general notifications.

---

### Channel 4 — WhatsApp

WhatsApp has higher open rates than SMS (typically >90%) and is dominant in WeShare's target markets — France, Belgium, Germany, Netherlands all have WhatsApp penetration above 70%.

**Pricing model (effective July 2025):**

WhatsApp switched from conversation-based billing to per-template-message billing. Categories:

- **Utility messages** (payment confirmations, receipts): ~$0.004–$0.046 per message depending on country
- **Authentication** (OTP, verification): similar to utility
- **Marketing** (promotions, announcements): $0.025–$0.137 per message — expensive, avoid for notifications
- **Service messages** (user-initiated, within 24h): free

For WeShare's use case — sending a debt notification or an invite — these are utility messages. At the low end (~$0.005 for France), that is affordable at moderate scale.

**The BSP layer:**

You cannot call Meta's WhatsApp Business API directly as a new business. You must go through a Business Solution Provider (BSP). Major BSPs:

| BSP | Notes |
|---|---|
| Twilio (via WhatsApp Business) | Already a Twilio customer if using SMS; same API, same credentials |
| 360dialog | Lowest markup; good for high volume; direct Meta partner |
| Vonage | Good if already using for SMS |
| Brevo | Bundled with email in same platform |

A BSP adds $0.003–$0.010 per message on top of Meta's rate, plus a monthly platform fee.

**Complexity:**

WhatsApp requires:
- Business verification with Meta (can take days to weeks)
- Phone number registration with the BSP
- Pre-approved message templates for all outbound messages (Meta reviews templates, takes 24–48 hours per template)
- A dedicated WhatsApp Business number (cannot use a personal number)

This is significant setup overhead for a startup.

**Recommendation:**

WhatsApp is the right long-term channel for European markets once WeShare has traction. The high open rates make it better than SMS for engagement. However:

- Do not add WhatsApp until the product has product-market fit and a clear notification strategy
- When adding it, use Twilio as the BSP if you are already on Twilio for SMS — same API, one vendor
- Start with utility templates only (debt notifications, invite links) — never marketing templates
- Have the template review process started at least 2 weeks before launch of the feature

---

## Architecture — How to Wire Notifications in WeShare

### Where notification triggers live

Notifications should be triggered server-side, not from the app. Reasons:
- The triggering user's app might close before the notification fires
- Multiple members need to be notified from one action (one expense added → notify all N members)
- Rate limiting and batching are easier server-side

**Two patterns:**

**Pattern A: Edge Function per notification type**

Each significant event calls a named Edge Function from the Supabase client:

    // In useCreateGroupExpense hook, after saving the expense:
    await supabase.functions.invoke('notify-expense-added', {
      body: { groupId, expenseId, addedByUserId },
    });

The Edge Function looks up the group members, fetches their push tokens and emails, and fires the notifications.

Pros: explicit, easy to test  
Cons: app must be online when the event fires; if the Edge Function call fails, the notification is lost

**Pattern B: Supabase Database Webhooks / pg_notify**

A Postgres trigger fires on `INSERT INTO expenses` and calls a Supabase Edge Function via `pg_net` (Supabase's HTTP extension):

    CREATE OR REPLACE FUNCTION notify_expense_added()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      PERFORM net.http_post(
        url := current_setting('app.edge_function_url') || '/notify-expense-added',
        body := json_build_object('expenseId', NEW.id, 'groupId', NEW.group_id)::text,
        headers := '{"Content-Type":"application/json","Authorization":"Bearer " || current_setting("app.service_role_key")}'
      );
      RETURN NEW;
    END;
    $$;

Pros: fires even if the app is closed; decoupled from the app layer; reliable  
Cons: more infrastructure; `pg_net` must be enabled (it is on Supabase Pro); harder to test

**Recommendation: Pattern A for now, Pattern B when reliability becomes a requirement.**

Pattern A is simpler and testable. When you need guaranteed delivery (e.g., the notification must fire even if the user's app crashed before the Edge Function call), switch to Pattern B.

### Push token storage

Device push tokens must be stored so the server can send to the right device. Add a `device_tokens` table:

    CREATE TABLE device_tokens (
      id          text        PRIMARY KEY,
      user_id     text        NOT NULL,
      token       text        NOT NULL,
      platform    text        NOT NULL CHECK (platform IN ('ios','android')),
      created_at  timestamptz NOT NULL DEFAULT now(),
      UNIQUE (user_id, token)
    );

The app registers its push token on startup and upserts this row. The Edge Function looks up all tokens for a given user_id before sending.

### User notification preferences

Not for v1, but important for scale: users should be able to turn off specific notification types per channel. A `notification_preferences` table:

    CREATE TABLE notification_preferences (
      user_id             text    PRIMARY KEY,
      push_expenses       bool    NOT NULL DEFAULT true,
      push_settlements    bool    NOT NULL DEFAULT true,
      push_group_activity bool    NOT NULL DEFAULT true,
      email_digest        bool    NOT NULL DEFAULT true,
      email_settlements   bool    NOT NULL DEFAULT true
    );

Without this, you will eventually get complaints about notification spam, and the only solution is a settings screen backed by persistent preferences.

---

## Throughput, Reliability, and the Notification Queue

### Why direct send breaks under load

The architecture described above ("call the Edge Function, Edge Function calls Resend/Expo") works fine in isolation. It breaks when multiple things happen at the same time, when a downstream provider has a hiccup, or when the per-second send rate matters — which it does for both push and email at any meaningful scale.

**Expo Push throughput ceiling**

Expo's push gateway enforces a hard limit of 600 notifications per second per project. In a small app with dispersed activity this is invisible. The problem appears as soon as a single popular event — say, a group expense added to a group with 50 members, at the same time as five other groups are also active — requires the server to fire dozens to hundreds of push notifications in a burst. If your Edge Function simply loops over all recipients and fires synchronously, you hit the rate limiter, some notifications are dropped, and there is no retry logic because the Edge Function has already returned.

A related problem: if the Edge Function fails midway through notifying a large group (timeout, OOM, transient network error), some members got the notification and some did not. You have no way to know which ones need a retry.

**Email send rate limits**

Email providers enforce stricter per-second limits than push, and they degrade differently: they return 429 errors which, if unhandled, silently drop the email. At Resend's free tier the daily cap (100/day) can be exhausted in seconds if multiple events fire simultaneously. Even on paid tiers, Resend and Postmark both recommend queueing on your side to smooth bursts rather than calling their API in tight loops.

Push and email are also not symmetric. Push delivery is near-instant; email delivery at Postmark averages 4 seconds and at Resend somewhat more. A worker that tries to send email in a tight synchronous loop will stall the Edge Function invocation long enough for Supabase's 25-second Edge Function timeout to become a real risk in high-volume scenarios.

**The deeper problem: no durability**

The fundamental flaw in "call Edge Function → Edge Function calls provider" is that there is no record of what was attempted. If Resend has a partial outage at 3am, the notifications fired during that window are silently lost. There is no backlog to drain when the outage clears. If someone asks "did the payment request notification get sent to Alice?", there is no answer.

---

### The queue-based solution: a notification outbox

The standard fix for this class of problem is the **outbox pattern**: instead of sending notifications in-band with the event, write a row to a notification queue table inside the same database transaction as the event. A separate worker process reads from the queue and does the actual sending. The queue provides durability, retry, throttling, and an audit trail — none of which exist in the direct-send model.

This is sometimes called an "at-least-once" delivery guarantee: the notification may be sent more than once in rare edge cases (worker crashes after sending but before marking the row done), but it will never be silently dropped.

---

### Queue table design

    CREATE TABLE notification_queue (
      id               text        PRIMARY KEY,
      user_id          text        NOT NULL,
      channel          text        NOT NULL CHECK (channel IN ('push','email','sms','whatsapp')),
      event_type       text        NOT NULL,
      payload          jsonb       NOT NULL,
      status           text        NOT NULL DEFAULT 'pending'
                                   CHECK (status IN ('pending','sending','failed','dead')),
      attempts         int         NOT NULL DEFAULT 0,
      max_attempts     int         NOT NULL DEFAULT 5,
      next_attempt_at  timestamptz NOT NULL DEFAULT now(),
      last_error       text,
      created_at       timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX ON notification_queue (status, next_attempt_at)
      WHERE status IN ('pending','failed');

**Column notes:**

`status` moves through a defined lifecycle:

- `pending` — row written, not yet attempted
- `sending` — a worker has claimed it and is actively trying to send (prevents double-send in concurrent environments)
- `failed` — last attempt failed, `next_attempt_at` is in the future, will be retried
- `dead` — exceeded `max_attempts`, needs human inspection

There is no `sent` status. When the Edge Function confirms delivery, the row is **deleted** — not updated to a terminal state. This keeps the table compact without any background pruning job and without accumulating historical rows. Rows that remain stuck in `sending` for more than 2 minutes indicate a worker crash mid-flight; a maintenance sweep (see worker section) resets them to `pending` automatically.

`payload` holds everything the worker needs to send without a further database lookup — the recipient's email address or push token, the rendered subject line, and the templated body content (or enough data to render it). Keeping all necessary data in the row means the worker is a simple read-execute-mark-done loop with no joins required.

`next_attempt_at` starts at `now()` so the first attempt runs immediately. After each failure it is advanced by an exponential backoff formula (see worker section below). This prevents a failed email from being retried a hundred times a second during an outage.

`max_attempts` defaults to 5 but can be overridden per-row. High-urgency events (payment request received) might warrant 10 attempts. Low-urgency events (group closed) might warrant only 2.

**Why keep `sending` as a separate status rather than just locking?**

`FOR UPDATE SKIP LOCKED` (used in the worker's SELECT) holds the lock only for the duration of the transaction. If the worker marks `status = 'sending'` within the transaction and then the send takes 5 seconds, the lock is held for 5 seconds. That is fine for low concurrency. At higher throughput, marking `sending` explicitly — and releasing the row-level lock immediately — lets other worker instances pick up different rows in parallel without waiting on in-flight sends. The tradeoff is a small `stuck-in-sending` edge case (worker crashes mid-send): the worker function includes a maintenance sweep at the top of each tick that resets any row stuck in `sending` for more than 2 minutes back to `pending`, so no rows are silently abandoned.

---

### The worker: a pg_cron function

A single pg_cron function handles all channels in one pass per minute. It reads per-channel rate limits from a config table (so they can be tuned at runtime without touching the function), keeps an in-memory counter per channel, and fires each row off to a Supabase Edge Function that does the actual provider call.

**Rate config table (create once):**

    CREATE TABLE notification_channel_config (
      channel     text  PRIMARY KEY,
      batch_size  int   NOT NULL DEFAULT 50,
      enabled     bool  NOT NULL DEFAULT true
    );

    INSERT INTO notification_channel_config (channel, batch_size, enabled) VALUES
      ('email',     50, true),
      ('push',     300, true),
      ('sms',       10, true),
      ('whatsapp',  20, true);

**The worker function:**

    CREATE OR REPLACE FUNCTION process_notification_queue()
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      rec          notification_queue%ROWTYPE;
      cfg_batch    int;
      cfg_enabled  bool;
      chan_count   int;
    BEGIN
      -- Reset rows stuck in 'sending' for more than 2 minutes (crashed worker recovery).
      -- next_attempt_at was <= now() when the row was claimed, so if it is still
      -- 'sending' two minutes later, next_attempt_at is safely in the past.
      UPDATE notification_queue
      SET    status = 'pending'
      WHERE  status = 'sending'
        AND  next_attempt_at < now() - INTERVAL '2 minutes';

      -- Per-channel counter table: acts as an in-memory hash keyed on channel.
      -- ON COMMIT DELETE ROWS clears it automatically when the function's
      -- transaction commits, so each cron tick starts with fresh zeroes.
      CREATE TEMP TABLE IF NOT EXISTS _chan_counts (
        channel  text PRIMARY KEY,
        sent     int  NOT NULL DEFAULT 0
      ) ON COMMIT DELETE ROWS;

      INSERT INTO _chan_counts (channel, sent)
      SELECT channel, 0
      FROM   notification_channel_config
      WHERE  enabled
      ON CONFLICT DO NOTHING;

      -- Scan all pending/failed rows across every channel, oldest-first.
      -- FOR UPDATE SKIP LOCKED: concurrent pg_cron instances (rare) skip
      -- rows another instance already holds, preventing double-send.
      FOR rec IN
        SELECT * FROM notification_queue
        WHERE  status IN ('pending','failed')
          AND  next_attempt_at <= now()
        ORDER BY next_attempt_at
        FOR UPDATE SKIP LOCKED
      LOOP
        -- 1. Load the channel's config
        SELECT batch_size, enabled
        INTO   cfg_batch, cfg_enabled
        FROM   notification_channel_config
        WHERE  channel = rec.channel;

        IF NOT FOUND OR NOT cfg_enabled THEN
          CONTINUE;
        END IF;

        -- 2. Check this channel's counter
        SELECT sent INTO chan_count
        FROM   _chan_counts
        WHERE  channel = rec.channel;

        IF COALESCE(chan_count, 0) >= cfg_batch THEN
          -- Channel budget exhausted for this tick. No UPDATE is applied;
          -- the row stays pending/failed and will be processed next minute.
          CONTINUE;
        END IF;

        -- 3. Within budget: claim the row
        UPDATE notification_queue
        SET    status = 'sending'
        WHERE  id = rec.id;

        -- 4. Increment the in-memory counter for this channel
        UPDATE _chan_counts
        SET    sent = sent + 1
        WHERE  channel = rec.channel;

        -- 5. Hand off to the Edge Function for the actual provider call
        PERFORM net.http_post(
          url     := current_setting('app.edge_function_url') || '/send-queued-notification',
          body    := json_build_object('notificationId', rec.id)::text,
          headers := json_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer ' || current_setting('app.service_role_key')
          )::text
        );
      END LOOP;
    END;
    $$;

    SELECT cron.schedule(
      'process-notification-queue',
      '* * * * *',
      'SELECT process_notification_queue()'
    );

**The Edge Function — success deletes the row, failure applies backoff:**

    // send-queued-notification/index.ts
    const { notificationId } = await req.json();

    const { data: notif } = await supabase
      .from('notification_queue')
      .select('*')
      .eq('id', notificationId)
      .single();

    try {
      await resend.emails.send({
        from:    'WeShare <noreply@ouishare.app>',
        to:      notif.payload.recipientEmail,
        subject: notif.payload.subject,
        html:    notif.payload.html,
      });

      // Successful send: delete the row. The table never accumulates
      // historical sent rows; it stays small without any pruning job.
      await supabase
        .from('notification_queue')
        .delete()
        .eq('id', notificationId);

    } catch (err) {
      const nextAttempts = notif.attempts + 1;
      const isDead       = nextAttempts >= notif.max_attempts;

      // Exponential backoff: 1 min, 2 min, 4 min, 8 min, 16 min
      const backoffMinutes = Math.pow(2, notif.attempts);
      const nextAttemptAt  = new Date(Date.now() + backoffMinutes * 60_000);

      await supabase.from('notification_queue').update({
        status:          isDead ? 'dead' : 'failed',
        attempts:        nextAttempts,
        next_attempt_at: nextAttemptAt.toISOString(),
        last_error:      err.message,
      }).eq('id', notificationId);
    }

---

### Throttling

Rates are controlled by `notification_channel_config`, a live table the worker reads on every tick. No function redeployment is needed to change a rate — a single SQL statement takes effect within one minute:

    -- Double the email rate
    UPDATE notification_channel_config SET batch_size = 100 WHERE channel = 'email';

    -- Suspend a channel during provider maintenance
    UPDATE notification_channel_config SET enabled = false WHERE channel = 'sms';

The worker's internal `_chan_counts` temp table acts as a hash keyed on channel name. Once a channel's counter reaches `batch_size`, further rows for that channel are skipped for the rest of that tick. Critically, rows for other channels are not affected — a saturated email channel does not block push processing within the same cron run.

**Default rates and ceilings:**

| Channel | batch_size/min | Effective rate | Provider ceiling |
|---|---|---|---|
| email | 50 | ~0.83/sec | Resend paid tier: well above this |
| push | 300 | 5/sec | Expo: 600/sec hard limit |
| sms | 10 | ~0.17/sec | Cost guard (~$0.07/msg in EU) |
| whatsapp | 20 | ~0.33/sec | Cost guard |

**Concurrency safety:** `FOR UPDATE SKIP LOCKED` is the concurrency primitive — if two worker instances ever ran simultaneously (not typical with pg_cron's default overlap prevention), each instance would pick non-overlapping rows. The channel counter in `_chan_counts` is per-session, not shared across instances. In the rare concurrent case this means the combined throughput could reach `2 × batch_size`; this is acceptable because the values are already conservative. If strict global capping is required, replace `_chan_counts` with an atomic `UPDATE ... RETURNING` against a persisted `notification_channel_credits` table reset by a separate cron job.

**Per-user throttling:** Since successfully sent rows are deleted (not retained), a simple `NOT EXISTS` guard against historical rows is not available. If you need to cap notifications per user per time window (e.g., at most one email per hour per recipient), add a small log table:

    CREATE TABLE notification_sent_log (
      id         text        PRIMARY KEY,
      user_id    text        NOT NULL,
      channel    text        NOT NULL,
      sent_at    timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX ON notification_sent_log (user_id, channel, sent_at);

The Edge Function inserts a row here before deleting from `notification_queue`. The worker's SELECT then adds:

    AND NOT EXISTS (
      SELECT 1 FROM notification_sent_log
      WHERE  user_id = rec.user_id
        AND  channel = rec.channel
        AND  sent_at > now() - INTERVAL '1 hour'
    )

A separate pg_cron job can purge `notification_sent_log` rows older than 24 hours to keep it small. This is a Phase 2 concern — start without it and add only if user-level spam becomes an issue.

---

### Retry and backoff

The exponential backoff schedule above is:

| Attempt | Delay before retry |
|---|---|
| 1st failure | 1 minute |
| 2nd failure | 2 minutes |
| 3rd failure | 4 minutes |
| 4th failure | 8 minutes |
| 5th failure → dead | 16 minutes (then stopped) |

This means during a Resend outage of up to ~30 minutes, all queued emails will be retried and eventually sent when the provider comes back. An outage longer than 31 minutes (sum of all backoff delays) will exhaust the default `max_attempts = 5`. For critical notifications (payment requests), raise `max_attempts` to 10, which extends coverage to ~17 hours.

The `dead` status is the fail-safe. Dead rows are kept in the table and can be inspected, manually retried (reset `status = 'pending', attempts = 0, next_attempt_at = now()`), or moved to an alerting queue. A daily pg_cron report of dead-letter count is a simple early-warning system for provider issues.

---

### Recovery during outages

The queue's key property is that it survives a full provider outage without data loss. If Resend is down for 2 hours:

1. Events still happen (group expenses, payment requests)
2. Rows are written to `notification_queue` with `status = 'pending'`
3. The worker runs every minute, finds rows, calls the Edge Function, gets a 5xx error from Resend, marks each row `failed` with a backoff timestamp
4. When Resend recovers, the backoff windows expire and the rows flip back to `status = 'failed'` with `next_attempt_at <= now()`
5. The next cron tick picks them up and they send successfully

The user experience during the outage: notifications arrive late (by up to `max_attempts × backoff` time), not silently dropped.

Compare this to the direct-send model: during the same outage, every Edge Function call returns an error, the error is logged, and the notification is permanently lost.

---

### Where this fits in the implementation sequence

This design is deliberately labelled a "hack to start" because it uses pg_cron + pg_net rather than a purpose-built worker process. That is a feature, not a bug, for early-stage WeShare:

- No new infrastructure: it runs entirely inside Supabase on existing pg_cron support
- SQL is easy to inspect and debug: `SELECT * FROM notification_queue WHERE status = 'dead'` tells you everything
- The queue table design is forward-compatible: when the time comes to move to a dedicated worker (a Supabase Edge Function on a timer, or a dedicated Node.js process), the table schema stays the same; only the worker changes

**Revised Phase 2 (email) now looks like this:**

1. Create `notification_queue` table and index
2. Create `notification_channel_config` table and seed default rates
3. Change event triggers (wherever `notify-expense-added` etc. are called) to INSERT into the queue instead of calling the provider directly
4. Implement `send-queued-notification` Edge Function (deletes row on success, applies backoff on failure)
5. Add the `process_notification_queue` pg_cron job
6. Add a `notification_preferences` opt-out check inside the worker SELECT (so opted-out users never get a row picked up, even if one was accidentally enqueued)

Push notifications (Phase 1) can be added to the same queue with `channel = 'push'`. No changes to the worker function are needed — it already handles all channels. Only the send call inside the Edge Function changes (Expo API instead of Resend) based on the `channel` field in the queued row. Set `batch_size = 300` in `notification_channel_config` for the push channel to stay well inside Expo's 600/sec ceiling.

---

## Cost Model at Different Scales

Assumptions:
- Average group has 4 members
- 1 expense added per group per day on average
- 10% of users have outstanding debts at any time

| MAU | Push | Email | SMS | WhatsApp |
|---|---|---|---|---|
| 500 | Free (Expo) | Free (Resend free tier) | $0 (deferred) | $0 (deferred) |
| 5,000 | Free (Expo) | ~$20/mo (Resend Pro) | ~$50/mo (invites only) | $0 (deferred) |
| 50,000 | Free (Expo) | ~$90/mo (Resend Scale) | ~$200/mo | ~$150/mo (utility, EU) |
| 500,000 | Free (Expo) or ~$200/mo direct FCM infra | ~$500/mo (Resend or migrate to SendGrid) | ~$1,500/mo | ~$1,000/mo |

At 500k MAU, total notification cost is in the $1,000–$3,000/month range. That is manageable if the product is monetised at that scale, but worth watching. The primary lever for cost control is:

1. **Batching**: instead of one push per expense, send a daily digest push if the user has multiple pending notifications. Reduces push volume significantly.
2. **Preference opt-outs**: users who turn off email save you real money at scale.
3. **Migrate email provider**: at very high volume, Mailgun or self-hosted Postfix (via AWS SES at $0.10 per 1,000 emails) beats Resend's per-email pricing.

---

## Recommended Implementation Sequence

**Phase 1 — Push only (now)**

- Add `device_tokens` table and migration
- Register device token in the app on login (using `expo-notifications`)
- One Edge Function: `notify-expense-added` — sends push to all group members except the person who added it
- One Edge Function: `notify-debt-owed` — sends push to the debtor when a settlement is computed
- No email, no SMS, no WhatsApp

**Phase 2 — Email for money events**

- Integrate Resend, configure as Supabase custom SMTP (covers auth emails too)
- Email template for: "You owe X to Y in group Z" — rendered with React Email
- Email template for: group invite to users without the app
- Add `notification_preferences` table with email opt-out

**Phase 3 — WhatsApp for invites (when traction in European markets)**

- Set up WhatsApp Business via Twilio BSP
- One template: group invite link
- One template: payment request reminder
- Do not expand until both templates are approved and tested

**Phase 4 — Orchestration platform (when multi-channel complexity grows)**

When managing push + email + WhatsApp preferences, batching, and delivery logs becomes a full-time task, evaluate Knock or Courier. Both offer:

- Single API for all channels
- Built-in preference centre UI
- Delivery logs and debugging
- Workflow builder (batching, delays, digests)

Knock pricing: free up to 10k notifications/month, then usage-based above that. At 50k MAU with moderate notification frequency, Knock costs roughly $200–$400/month — reasonable if it replaces the engineering overhead of maintaining the orchestration logic yourself.

---

## What Not to Do

**Don't use SMS for expense notifications.** The cost per message in France/Belgium/Germany is $0.06–$0.08. Sending a push for every expense is free. Sending an SMS for the same event at 50,000 users × 5 expenses/month = 250,000 SMS × $0.07 = $17,500/month. This is not a misprint.

**Don't send WhatsApp marketing templates.** They cost 5–10× more than utility templates and users perceive them as spam. Stick to transactional utility templates.

**Don't trigger notifications from the client.** If the client crashes, the notification is lost. Event triggers belong server-side (Edge Functions or database triggers).

**Don't skip the preference centre.** Users who cannot control notification frequency churn. Build at minimum an email opt-out before sending more than two emails per week per user.

---

## References

- [Expo push notifications docs](https://docs.expo.dev/push-notifications/faq/)
- [Expo pricing](https://expo.dev/pricing)
- [Resend pricing](https://resend.com/pricing)
- [Resend vs SendGrid vs Postmark comparison 2026](https://blog.vibecoder.me/email-service-pricing-resend-sendgrid-postmark)
- [Postmark vs Resend — bootstrapped SaaS 2026](https://f3fundit.com/transactional-email-bootstrapped-saas-resend-sendgrid-postmark-mailgun-2026/)
- [Top push notification services for Expo/React Native 2025](https://pushbase.dev/blog/top-5-push-notification-services-for-expo-react-native-in-2025)
- [Knock — notification infrastructure](https://knock.app/)
- [Knock pricing](https://knock.app/pricing)
- [The top 7 push notification providers 2026](https://knock.app/blog/evaluating-the-best-push-notifications-providers)
- [WhatsApp Business API pricing 2026](https://flowcall.co/blog/whatsapp-business-api-pricing-2026)
- [WhatsApp per-message pricing changes July 2025](https://blueticks.co/blog/whatsapp-business-api-pricing-2026)
- [Twilio SMS pricing](https://www.twilio.com/en-us/sms/pricing/us)
- [SendGrid free tier removed May 2025](https://dreamlit.ai/blog/best-sendgrid-alternatives)
- [Best SMTP providers for Supabase 2026](https://www.pingram.io/blog/best-smtp-providers-for-supabase)
