-- Migration 050: make reset_user_data work, and only for the caller's own data.
--
-- Two bugs, found by the release tests (release/flows/accountReset.release.test.ts):
--
-- 1. trip_members.user_id became text in 027, but the function still compared
--    it to the uuid parameter, so every call failed with
--    "operator does not exist: text = uuid".
-- 2. The ownership check only ran when auth.uid() was set. Supabase's default
--    privileges also granted EXECUTE to anon (018's REVOKE FROM PUBLIC does not
--    remove that), so an anonymous caller skipped the check entirely. Only bug 1
--    stopped this SECURITY DEFINER function from deleting any user's trips.
--
-- Now: signed-in users may reset only themselves; the service role (Edge
-- Functions) and direct SQL sessions (dashboard) may reset anyone.

CREATE OR REPLACE FUNCTION public.reset_user_data(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() IN ('anon', 'authenticated')
     AND (auth.uid() IS NULL OR auth.uid() <> p_user_id) THEN
    RAISE EXCEPTION 'Permission denied: you may only reset your own data';
  END IF;

  -- Delete owned trips. Cascades to:
  --   trip_members, expenses, splits, split_requests
  DELETE FROM trips WHERE owner_id = p_user_id;

  -- Remove from any trips owned by someone else.
  DELETE FROM trip_members WHERE user_id = p_user_id::text;

  DELETE FROM device_tokens WHERE user_id = p_user_id::text;
END;
$$;

REVOKE ALL ON FUNCTION public.reset_user_data(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_user_data(uuid) TO authenticated, service_role;
