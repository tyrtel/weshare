-- Migration 035: push-notify on settlement status changes.
--
-- Fires from a single trigger on split_requests covering BOTH ways a status
-- can change:
--   1. Client-driven: "Record Payment" (useSettlement/useGroupDetail/
--      useSettleAllGroupDebts) INSERTs a new row already at status 'paid'.
--   2. Server-driven: the Stripe and Open Banking webhooks UPDATE an
--      existing row's status directly, with no authenticated client in the
--      request at all — there is no session to call enqueue_notification
--      from, so a client-side enqueue could never reach this path.
--
-- A DB trigger is the only mechanism that naturally covers both. It inserts
-- directly into notification_queue rather than going through the
-- enqueue_notification RPC, because that RPC's shared-group check is keyed
-- on auth.uid(), which is null under the webhooks' service-role calls — the
-- trigger already runs SECURITY DEFINER in a trusted context, and the
-- requester/payer relationship on the row itself is the authorization.

CREATE OR REPLACE FUNCTION notify_split_request_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recipient   text;
  v_other_id    text;
  v_other_name  text;
  v_event_type  text;
  v_title       text;
  v_body        text;
  v_amount_text text;
  v_pending     int;
BEGIN
  -- Self-payment is not a real scenario today, but cheap to guard against.
  IF NEW.payer_user_id = NEW.requester_user_id THEN
    RETURN NEW;
  END IF;

  IF NEW.status IN ('paid', 'completed') THEN
    v_recipient  := NEW.requester_user_id;  -- creditor: wants to know they got paid
    v_other_id   := NEW.payer_user_id;
    v_event_type := 'expense_settled';
  ELSIF TG_OP = 'UPDATE' AND NEW.status IN ('declined', 'expired') THEN
    v_recipient  := NEW.payer_user_id;      -- debtor: their payment didn't go through
    v_other_id   := NEW.requester_user_id;
    v_event_type := 'payment_failed';
  ELSE
    RETURN NEW;  -- not a status this feature notifies on
  END IF;

  -- On INSERT there is no OLD row; on UPDATE, only notify on a real
  -- transition (the column-level trigger fires whenever `status` is part of
  -- the SET list, even if the value is unchanged).
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- Per-recipient depth guard, mirroring enqueue_notification's existing
  -- cap — this bypasses that RPC, so it needs its own copy of the same
  -- protection. A group/trip member can call "Record Payment" repeatedly,
  -- so this path is just as spammable as the client-enqueue one.
  SELECT COUNT(*) INTO v_pending
    FROM notification_queue
    WHERE user_id = v_recipient
      AND status IN ('pending', 'failed');
  IF v_pending >= 20 THEN
    RETURN NEW;
  END IF;

  -- Counterparty's display name — group-scoped rows look in group_members,
  -- trip-scoped rows look in trip_members; a request can only have one of
  -- group_id/trip_id set (split_requests_scope_check, migration 034).
  IF NEW.group_id IS NOT NULL THEN
    SELECT display_name INTO v_other_name
      FROM group_members
      WHERE group_id = NEW.group_id AND user_id = v_other_id;
  ELSE
    SELECT display_name INTO v_other_name
      FROM trip_members
      WHERE trip_id = NEW.trip_id AND user_id = v_other_id;
  END IF;
  v_other_name := COALESCE(v_other_name, 'Someone');

  -- Zero-decimal currencies (JPY) have no minor unit — mirrors
  -- getMinorUnitMultiplier's special case on the client.
  IF NEW.currency = 'JPY' THEN
    v_amount_text := to_char(NEW.amount_cents, 'FM999999999');
  ELSE
    v_amount_text := to_char(NEW.amount_cents::numeric / 100, 'FM999999999.00');
  END IF;

  IF v_event_type = 'expense_settled' THEN
    v_title := 'Payment received';
    v_body  := v_other_name || ' paid you ' || v_amount_text || ' ' || NEW.currency;
  ELSE
    v_title := 'Payment failed';
    v_body  := 'Your payment of ' || v_amount_text || ' ' || NEW.currency || ' to ' || v_other_name || ' didn''t go through';
  END IF;

  INSERT INTO notification_queue (id, user_id, channel, event_type, payload, max_attempts)
  VALUES (
    gen_random_uuid()::text,
    v_recipient,
    'push',
    v_event_type,
    jsonb_build_object('title', v_title, 'body', v_body),
    5
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER split_requests_notify_status_change
  AFTER INSERT OR UPDATE OF status ON public.split_requests
  FOR EACH ROW EXECUTE FUNCTION notify_split_request_status_change();
