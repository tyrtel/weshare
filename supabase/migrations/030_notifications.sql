CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA cron;

-- Push device token registry
CREATE TABLE device_tokens (
  id          text        PRIMARY KEY,
  user_id     text        NOT NULL,
  token       text        NOT NULL,
  platform    text        NOT NULL CHECK (platform IN ('ios','android')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, token)
);

-- Notification outbox — rows are deleted on successful send, not retained
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

-- Partial index: excludes terminal rows (dead stay small; sent rows are deleted)
CREATE INDEX notification_queue_work_idx
  ON notification_queue (status, next_attempt_at)
  WHERE status IN ('pending','failed');

-- Per-channel rate limits — UPDATE these rows to change throughput at runtime
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

-- ── Row-level security ────────────────────────────────────────────────────────

ALTER TABLE device_tokens             ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_queue        ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_channel_config ENABLE ROW LEVEL SECURITY;

-- Users manage their own device tokens only
CREATE POLICY "users manage own device tokens"
  ON device_tokens FOR ALL
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

-- Any authenticated user can enqueue a notification for any recipient.
-- The app is trusted to only enqueue for group members; validation is not enforced here.
CREATE POLICY "authenticated users can enqueue"
  ON notification_queue FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Users can inspect their own queue entries (e.g. for debugging / status display)
CREATE POLICY "users read own notifications"
  ON notification_queue FOR SELECT
  USING (user_id = auth.uid()::text);

-- Config is readable by all; only service role can modify
CREATE POLICY "read channel config"
  ON notification_channel_config FOR SELECT
  USING (true);

-- ── pg_cron worker ────────────────────────────────────────────────────────────

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
  -- Reset rows stuck in 'sending' for more than 2 minutes.
  -- next_attempt_at was <= now() when the row was claimed, so checking
  -- next_attempt_at < now() - INTERVAL '2 minutes' correctly identifies
  -- rows that have been in-flight for at least 2 minutes.
  UPDATE notification_queue
  SET    status = 'pending'
  WHERE  status = 'sending'
    AND  next_attempt_at < now() - INTERVAL '2 minutes';

  -- Per-channel counter table — acts as an in-memory hash keyed on channel.
  -- ON COMMIT DELETE ROWS wipes it when the function's transaction commits,
  -- so each cron tick starts with fresh zeroes.
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
  -- FOR UPDATE SKIP LOCKED: concurrent instances (rare) skip locked rows,
  -- preventing double-send without requiring a distributed lock.
  FOR rec IN
    SELECT * FROM notification_queue
    WHERE  status IN ('pending','failed')
      AND  next_attempt_at <= now()
    ORDER BY next_attempt_at
    FOR UPDATE SKIP LOCKED
  LOOP
    -- Load config for this channel
    SELECT batch_size, enabled
    INTO   cfg_batch, cfg_enabled
    FROM   notification_channel_config
    WHERE  channel = rec.channel;

    IF NOT FOUND OR NOT cfg_enabled THEN
      CONTINUE;
    END IF;

    -- Check per-channel counter
    SELECT sent INTO chan_count
    FROM   _chan_counts
    WHERE  channel = rec.channel;

    IF COALESCE(chan_count, 0) >= cfg_batch THEN
      -- Budget exhausted for this channel this tick; row stays pending/failed.
      CONTINUE;
    END IF;

    -- Claim the row
    UPDATE notification_queue
    SET    status = 'sending'
    WHERE  id = rec.id;

    -- Increment channel counter
    UPDATE _chan_counts
    SET    sent = sent + 1
    WHERE  channel = rec.channel;

    -- Fire the Edge Function that does the actual provider call
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
