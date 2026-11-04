-- Migration 052: invite links expire, can be reset, and stop working when a
-- trip is closed.
--
-- A link is open while invite_ttl_hours is null (never expires) or
-- invite_created_at + invite_ttl_hours is in the future, and, for trips, the
-- trip isn't closed. The owner picks the lifetime; resetting issues a new
-- token and restarts the clock, so the old link stops working at once.
--
-- Two callers get through an expired link: existing members (joining is
-- idempotent) and someone whose email matches a guest placeholder, since the
-- owner invited them by name and the link may sit unread for a while.
--
-- Existing trips get the 7-day default from now. No production invite link
-- worked before 051, so no working link is cut short.

ALTER TABLE public.trips
  ADD COLUMN invite_created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN invite_ttl_hours  integer DEFAULT 168 CHECK (invite_ttl_hours > 0);

ALTER TABLE public.groups
  ADD COLUMN invite_created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN invite_ttl_hours  integer CHECK (invite_ttl_hours > 0);

CREATE OR REPLACE FUNCTION public.invite_is_open(p_created_at timestamptz, p_ttl_hours integer)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT p_ttl_hours IS NULL OR p_created_at + make_interval(hours => p_ttl_hours) > now();
$$;

-- ── Trips ────────────────────────────────────────────────────────────────────

-- True when the caller is already a member or matches a placeholder by email.
CREATE OR REPLACE FUNCTION public.caller_has_trip_slot(p_trip_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM trip_members m
    WHERE m.trip_id = p_trip_id
      AND (
        m.user_id = auth.uid()::text
        OR lower(m.email) = (SELECT lower(email) FROM auth.users WHERE id = auth.uid())
      )
  );
$$;

DROP FUNCTION public.preview_trip_invite(text);
CREATE FUNCTION public.preview_trip_invite(p_token text)
RETURNS TABLE (id text, name text, expired boolean)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    t.id::text,
    t.name,
    (t.status = 'closed' OR NOT invite_is_open(t.invite_created_at, t.invite_ttl_hours))
      AND NOT caller_has_trip_slot(t.id)
  FROM trips t
  WHERE t.invite_token = p_token;
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
  v_trip        trips%ROWTYPE;
  v_email       text;
  v_placeholder text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to join' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_trip FROM trips WHERE invite_token = p_token;
  IF v_trip.id IS NULL THEN
    RAISE EXCEPTION 'Invite not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM trip_members WHERE trip_id = v_trip.id AND user_id = v_uid) THEN
    SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();

    SELECT user_id INTO v_placeholder
      FROM trip_members
      WHERE trip_id = v_trip.id AND v_email IS NOT NULL AND lower(email) = lower(v_email)
      LIMIT 1;

    IF v_placeholder IS NOT NULL THEN
      PERFORM claim_member_slot(v_trip.id::text, v_placeholder);
      UPDATE trip_members
        SET display_name = p_display_name,
            avatar_url   = coalesce(p_avatar_url, avatar_url)
        WHERE trip_id = v_trip.id AND user_id = v_uid;
    ELSIF v_trip.status = 'closed' OR NOT invite_is_open(v_trip.invite_created_at, v_trip.invite_ttl_hours) THEN
      RAISE EXCEPTION 'Invite expired' USING ERRCODE = 'WS410';
    ELSE
      INSERT INTO trip_members (trip_id, user_id, display_name, is_guest, avatar_url)
        VALUES (v_trip.id, v_uid, p_display_name, false, p_avatar_url);
    END IF;
  END IF;

  RETURN QUERY SELECT * FROM trip_members WHERE trip_id = v_trip.id AND user_id = v_uid;
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_trip_invite(p_trip_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions -- generate_invite_token() uses pgcrypto
AS $$
BEGIN
  UPDATE trips
    SET invite_token = generate_invite_token(), invite_created_at = now()
    WHERE id = p_trip_id::uuid AND owner_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only the trip owner can reset the invite link' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- ── Groups ───────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.caller_has_group_slot(p_group_id text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM group_members m
    WHERE m.group_id = p_group_id
      AND (
        m.user_id = auth.uid()::text
        OR lower(m.email) = (SELECT lower(email) FROM auth.users WHERE id = auth.uid())
      )
  );
$$;

DROP FUNCTION public.preview_group_invite(text);
CREATE FUNCTION public.preview_group_invite(p_token text)
RETURNS TABLE (id text, name text, expired boolean)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    g.id,
    g.name,
    NOT invite_is_open(g.invite_created_at, g.invite_ttl_hours) AND NOT caller_has_group_slot(g.id)
  FROM groups g
  WHERE g.invite_token = p_token;
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
  v_group       groups%ROWTYPE;
  v_email       text;
  v_placeholder text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to join' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_group FROM groups WHERE invite_token = p_token;
  IF v_group.id IS NULL THEN
    RAISE EXCEPTION 'Invite not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM group_members WHERE group_id = v_group.id AND user_id = v_uid) THEN
    SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();

    SELECT user_id INTO v_placeholder
      FROM group_members
      WHERE group_id = v_group.id AND v_email IS NOT NULL AND lower(email) = lower(v_email)
      LIMIT 1;

    IF v_placeholder IS NOT NULL THEN
      PERFORM claim_group_member_slot(v_group.id, v_placeholder);
      UPDATE group_members
        SET display_name = p_display_name,
            avatar_url   = coalesce(p_avatar_url, avatar_url)
        WHERE group_id = v_group.id AND user_id = v_uid;
    ELSIF NOT invite_is_open(v_group.invite_created_at, v_group.invite_ttl_hours) THEN
      RAISE EXCEPTION 'Invite expired' USING ERRCODE = 'WS410';
    ELSE
      INSERT INTO group_members (group_id, user_id, display_name, is_guest, avatar_url)
        VALUES (v_group.id, v_uid, p_display_name, false, p_avatar_url);
    END IF;
  END IF;

  RETURN QUERY SELECT * FROM group_members WHERE group_id = v_group.id AND user_id = v_uid;
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_group_invite(p_group_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions -- generate_invite_token() uses pgcrypto
AS $$
BEGIN
  UPDATE groups
    SET invite_token = generate_invite_token(), invite_created_at = now()
    WHERE id = p_group_id AND owner_id = auth.uid()::text;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only the group owner can reset the invite link' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- ── Grants ───────────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.caller_has_trip_slot(uuid)  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.caller_has_group_slot(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.preview_trip_invite(text)   FROM PUBLIC;
REVOKE ALL ON FUNCTION public.preview_group_invite(text)  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reset_trip_invite(text)     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reset_group_invite(text)    FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.preview_trip_invite(text)  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.preview_group_invite(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reset_trip_invite(text)    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reset_group_invite(text)   TO authenticated, service_role;
