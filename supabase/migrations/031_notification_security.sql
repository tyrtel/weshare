-- Close the open INSERT policy; all queue insertions must now go through
-- enqueue_notification, which enforces group-membership, size, and depth
-- limits before calling INSERT as SECURITY DEFINER.

-- 1. Remove the open INSERT policy
DROP POLICY "authenticated users can enqueue" ON notification_queue;

-- 2. Column-level guards (NOT VALID so existing rows are not scanned)
ALTER TABLE notification_queue
  ADD CONSTRAINT notification_queue_payload_size
    CHECK (octet_length(payload::text) < 4096) NOT VALID,
  ADD CONSTRAINT notification_queue_max_attempts_range
    CHECK (max_attempts BETWEEN 1 AND 10) NOT VALID;

-- 3. Index to make the per-user depth check in enqueue_notification fast
CREATE INDEX notification_queue_user_pending_idx
  ON notification_queue (user_id)
  WHERE status IN ('pending', 'failed');

-- 4. SECURITY DEFINER RPC: the only path by which authenticated users may enqueue
CREATE OR REPLACE FUNCTION enqueue_notification(
  p_user_id      text,
  p_channel      text,
  p_event_type   text,
  p_payload      jsonb,
  p_max_attempts int DEFAULT 5
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Caller must share at least one group with the target user.
  -- Prevents enqueuing for arbitrary user IDs outside the caller's groups.
  IF NOT EXISTS (
    SELECT 1
    FROM   group_members gm1
    JOIN   group_members gm2 USING (group_id)
    WHERE  gm1.user_id = auth.uid()::text
      AND  gm2.user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'caller is not in a shared group with target user';
  END IF;

  IF p_max_attempts < 1 OR p_max_attempts > 10 THEN
    RAISE EXCEPTION 'max_attempts must be between 1 and 10';
  END IF;

  IF octet_length(p_payload::text) > 4096 THEN
    RAISE EXCEPTION 'payload exceeds 4096-byte limit';
  END IF;

  -- Per-user depth guard: prevents a caller from flooding one recipient's queue.
  IF (
    SELECT COUNT(*)
    FROM   notification_queue
    WHERE  user_id = p_user_id
      AND  status IN ('pending', 'failed')
  ) >= 20 THEN
    RAISE EXCEPTION 'notification queue depth limit exceeded for user';
  END IF;

  INSERT INTO notification_queue (id, user_id, channel, event_type, payload, max_attempts)
  VALUES (
    gen_random_uuid()::text,
    p_user_id,
    p_channel,
    p_event_type,
    p_payload,
    p_max_attempts
  );
END;
$$;

-- 5. Replace process_notification_queue to add dead-row purge at each tick
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
  -- Purge dead rows older than 7 days to keep the table compact
  DELETE FROM notification_queue
  WHERE  status = 'dead'
    AND  created_at < now() - INTERVAL '7 days';

  -- Reset rows stuck in 'sending' for more than 2 minutes.
  -- next_attempt_at was <= now() when the row was claimed, so checking
  -- next_attempt_at < now() - INTERVAL '2 minutes' correctly identifies
  -- rows that have been in-flight for at least 2 minutes.
  UPDATE notification_queue
  SET    status = 'pending'
  WHERE  status = 'sending'
    AND  next_attempt_at < now() - INTERVAL '2 minutes';

  CREATE TEMP TABLE IF NOT EXISTS _chan_counts (
    channel  text PRIMARY KEY,
    sent     int  NOT NULL DEFAULT 0
  ) ON COMMIT DELETE ROWS;

  INSERT INTO _chan_counts (channel, sent)
  SELECT channel, 0
  FROM   notification_channel_config
  WHERE  enabled
  ON CONFLICT DO NOTHING;

  FOR rec IN
    SELECT * FROM notification_queue
    WHERE  status IN ('pending','failed')
      AND  next_attempt_at <= now()
    ORDER BY next_attempt_at
    FOR UPDATE SKIP LOCKED
  LOOP
    SELECT batch_size, enabled
    INTO   cfg_batch, cfg_enabled
    FROM   notification_channel_config
    WHERE  channel = rec.channel;

    IF NOT FOUND OR NOT cfg_enabled THEN
      CONTINUE;
    END IF;

    SELECT sent INTO chan_count
    FROM   _chan_counts
    WHERE  channel = rec.channel;

    IF COALESCE(chan_count, 0) >= cfg_batch THEN
      CONTINUE;
    END IF;

    UPDATE notification_queue
    SET    status = 'sending'
    WHERE  id = rec.id;

    UPDATE _chan_counts
    SET    sent = sent + 1
    WHERE  channel = rec.channel;

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
