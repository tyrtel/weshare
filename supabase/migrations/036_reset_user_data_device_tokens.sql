-- Migration 036: reset_user_data must also delete the user's device tokens.
--
-- device_tokens (migration 030) postdates this function (018) and was never
-- added to it. The privacy policy (published alongside the push notification
-- feature) promises the push token is "deleted when you revoke notification
-- permission or delete your account" — this closes the account-deletion half
-- of that promise. (The sign-out half is handled client-side, best-effort, in
-- useRegisterPushToken.ts — best-effort because by the time the client's
-- onAuthStateChange fires with a null user the local session may already be
-- cleared, so that DELETE can lose its RLS-authorized context. This function
-- runs as service_role and bypasses RLS entirely, so it's the one guaranteed
-- cleanup path.)

CREATE OR REPLACE FUNCTION public.reset_user_data(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Permission denied: you may only reset your own data';
  END IF;

  -- Delete owned trips. Cascades to:
  --   trip_members, expenses, splits, split_requests
  DELETE FROM trips WHERE owner_id = p_user_id;

  -- Remove from any trips owned by someone else.
  DELETE FROM trip_members WHERE user_id = p_user_id;

  -- Push device tokens are keyed by text user_id (guest ids are non-UUID),
  -- so p_user_id needs the same ::text cast used throughout the notification
  -- schema (030/034).
  DELETE FROM device_tokens WHERE user_id = p_user_id::text;
END;
$$;

REVOKE ALL ON FUNCTION public.reset_user_data(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_user_data(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_user_data(uuid) TO service_role;
