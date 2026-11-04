-- Migration 051: make invite links work against the real database, and require
-- the invite token to join.
--
-- Found by the release tests (docs/release-tests-todo.md, finding 1):
--
-- 1. Trips and groups are readable only by owners and members, so the person
--    opening an invite link could never load the trip or group by its token.
-- 2. trip_members and group_members allowed any signed-in user to insert their
--    own row, so anyone who knew a trip or group id could join without a token.
--
-- RLS can't express "readable if you know the token": a row policy only sees
-- the row, not the filter the caller used, so the nearest policy would expose
-- every token. Instead, two SECURITY DEFINER functions per kind take the token
-- and act on the one matching row only. Self-insert is removed; owners still
-- add members directly.
--
-- Also: the groups trigger generated base64 tokens, which can contain '+' and
-- '/' and break invite URLs. It now uses generate_invite_token() like trips.
-- The app stops sending its own (Math.random) tokens in the same change.

-- ── Token generation ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION generate_group_invite_token()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.invite_token IS NULL THEN
    NEW.invite_token := public.generate_invite_token();
  END IF;
  RETURN NEW;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS groups_invite_token_key ON public.groups(invite_token);

-- ── claim_member_slot: fix uuid = text ───────────────────────────────────────
-- trip_id is uuid on trip_members, expenses and split_requests, but the
-- parameter is text, so every call failed with "operator does not exist:
-- uuid = text" (048 fixed the user id columns, not this one). That also broke
-- the trip half of merge_guest_records_for_new_user (033). Same body as 032
-- with the parameter cast once; the signature stays for existing callers.

CREATE OR REPLACE FUNCTION claim_member_slot(p_trip_id text, p_placeholder_user_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trip_id           uuid := p_trip_id::uuid;
  v_caller_email      text;
  v_placeholder_email text;
BEGIN
  SELECT email INTO v_caller_email FROM auth.users WHERE id = auth.uid();

  SELECT email INTO v_placeholder_email
    FROM trip_members
    WHERE trip_id = v_trip_id AND user_id = p_placeholder_user_id;

  IF v_caller_email IS NULL OR v_placeholder_email IS NULL
     OR lower(v_caller_email) != lower(v_placeholder_email) THEN
    RAISE EXCEPTION 'Email mismatch: cannot claim this member slot';
  END IF;

  UPDATE trip_members
    SET user_id = auth.uid()::text, is_guest = false
    WHERE trip_id = v_trip_id AND user_id = p_placeholder_user_id;

  UPDATE expenses
    SET paid_by_user_id = auth.uid()::text
    WHERE trip_id = v_trip_id AND paid_by_user_id = p_placeholder_user_id;

  UPDATE splits
    SET user_id = auth.uid()::text
    WHERE user_id = p_placeholder_user_id
      AND expense_id IN (SELECT id FROM expenses WHERE trip_id = v_trip_id);

  UPDATE split_requests
    SET payer_user_id = auth.uid()::text
    WHERE trip_id = v_trip_id AND payer_user_id = p_placeholder_user_id;

  UPDATE split_requests
    SET requester_user_id = auth.uid()::text
    WHERE trip_id = v_trip_id AND requester_user_id = p_placeholder_user_id;
END;
$$;

-- The trip loop of the sign-in guest merge also failed before reaching the
-- body above: it passed a uuid to the text parameter, and Postgres doesn't
-- cast implicitly when resolving a function ("function claim_member_slot(uuid,
-- text) does not exist"). Same as 033 with ::text added.

CREATE OR REPLACE FUNCTION merge_guest_records_for_new_user()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_email text;
  v_match        record;
BEGIN
  SELECT email INTO v_caller_email FROM auth.users WHERE id = auth.uid();
  IF v_caller_email IS NULL THEN
    RETURN;
  END IF;

  FOR v_match IN
    SELECT group_id, user_id FROM group_members
      WHERE is_guest = true AND email IS NOT NULL AND lower(email) = lower(v_caller_email)
  LOOP
    BEGIN
      PERFORM claim_group_member_slot(v_match.group_id, v_match.user_id);
    EXCEPTION WHEN others THEN
      RAISE WARNING 'merge_guest_records_for_new_user: failed to claim group % member %: %',
        v_match.group_id, v_match.user_id, sqlerrm;
    END;
  END LOOP;

  FOR v_match IN
    SELECT trip_id, user_id FROM trip_members
      WHERE is_guest = true AND email IS NOT NULL AND lower(email) = lower(v_caller_email)
  LOOP
    BEGIN
      PERFORM claim_member_slot(v_match.trip_id::text, v_match.user_id);
    EXCEPTION WHEN others THEN
      RAISE WARNING 'merge_guest_records_for_new_user: failed to claim trip % member %: %',
        v_match.trip_id, v_match.user_id, sqlerrm;
    END;
  END LOOP;
END;
$$;

-- ── Trips ────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.preview_trip_invite(p_token text)
RETURNS TABLE (id text, name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT t.id::text, t.name FROM trips t WHERE t.invite_token = p_token;
$$;

CREATE OR REPLACE FUNCTION public.join_trip_by_invite(
  p_token        text,
  p_display_name text,
  p_avatar_url   text
)
RETURNS SETOF trip_members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid         text := auth.uid()::text;
  v_trip_id     uuid;
  v_email       text;
  v_placeholder text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to join' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_trip_id FROM trips WHERE invite_token = p_token;
  IF v_trip_id IS NULL THEN
    RAISE EXCEPTION 'Invite not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM trip_members WHERE trip_id = v_trip_id AND user_id = v_uid) THEN
    SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();

    SELECT user_id INTO v_placeholder
      FROM trip_members
      WHERE trip_id = v_trip_id AND v_email IS NOT NULL AND lower(email) = lower(v_email)
      LIMIT 1;

    IF v_placeholder IS NOT NULL THEN
      PERFORM claim_member_slot(v_trip_id::text, v_placeholder);
      UPDATE trip_members
        SET display_name = p_display_name,
            avatar_url   = coalesce(p_avatar_url, avatar_url)
        WHERE trip_id = v_trip_id AND user_id = v_uid;
    ELSE
      INSERT INTO trip_members (trip_id, user_id, display_name, is_guest, avatar_url)
        VALUES (v_trip_id, v_uid, p_display_name, false, p_avatar_url);
    END IF;
  END IF;

  RETURN QUERY SELECT * FROM trip_members WHERE trip_id = v_trip_id AND user_id = v_uid;
END;
$$;

DROP POLICY IF EXISTS "trip_members: owner or self can insert" ON public.trip_members;
CREATE POLICY "trip_members: owner can insert"
  ON public.trip_members FOR INSERT
  WITH CHECK (public.is_trip_owner(trip_members.trip_id));

-- ── Groups ───────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.preview_group_invite(p_token text)
RETURNS TABLE (id text, name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT g.id, g.name FROM groups g WHERE g.invite_token = p_token;
$$;

CREATE OR REPLACE FUNCTION public.join_group_by_invite(
  p_token        text,
  p_display_name text,
  p_avatar_url   text
)
RETURNS SETOF group_members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid         text := auth.uid()::text;
  v_group_id    text;
  v_email       text;
  v_placeholder text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to join' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_group_id FROM groups WHERE invite_token = p_token;
  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'Invite not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM group_members WHERE group_id = v_group_id AND user_id = v_uid) THEN
    SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();

    SELECT user_id INTO v_placeholder
      FROM group_members
      WHERE group_id = v_group_id AND v_email IS NOT NULL AND lower(email) = lower(v_email)
      LIMIT 1;

    IF v_placeholder IS NOT NULL THEN
      PERFORM claim_group_member_slot(v_group_id, v_placeholder);
      UPDATE group_members
        SET display_name = p_display_name,
            avatar_url   = coalesce(p_avatar_url, avatar_url)
        WHERE group_id = v_group_id AND user_id = v_uid;
    ELSE
      INSERT INTO group_members (group_id, user_id, display_name, is_guest, avatar_url)
        VALUES (v_group_id, v_uid, p_display_name, false, p_avatar_url);
    END IF;
  END IF;

  RETURN QUERY SELECT * FROM group_members WHERE group_id = v_group_id AND user_id = v_uid;
END;
$$;

DROP POLICY IF EXISTS "group_members: owner or self can insert" ON public.group_members;

-- ── Grants ───────────────────────────────────────────────────────────────────
-- Previews are open to anon so a signed-out user sees what they're invited to.

REVOKE ALL ON FUNCTION public.preview_trip_invite(text)              FROM PUBLIC;
REVOKE ALL ON FUNCTION public.preview_group_invite(text)             FROM PUBLIC;
REVOKE ALL ON FUNCTION public.join_trip_by_invite(text, text, text)  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.join_group_by_invite(text, text, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.preview_trip_invite(text)              TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.preview_group_invite(text)             TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.join_trip_by_invite(text, text, text)  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.join_group_by_invite(text, text, text) TO authenticated, service_role;
