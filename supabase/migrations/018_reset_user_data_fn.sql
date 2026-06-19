-- Utility RPC for wiping all trips and memberships belonging to a user.
-- Intended for development/testing use only — not exposed in the app UI.
--
-- Security: authenticated users may only reset their own data.
-- The service_role (SQL editor, CLI) may pass any UUID.
--
-- Usage from SQL editor:
--   SELECT reset_user_data('<user-uuid>');
--
-- Usage from app:
--   supabase.rpc('reset_user_data', { p_user_id: user.id })

CREATE OR REPLACE FUNCTION public.reset_user_data(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- When called by a regular authenticated user (not service_role), they may
  -- only reset their own data.
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Permission denied: you may only reset your own data';
  END IF;

  -- Delete owned trips. Cascades to:
  --   trip_members, expenses, splits, split_requests
  DELETE FROM trips WHERE owner_id = p_user_id;

  -- Remove from any trips owned by someone else.
  DELETE FROM trip_members WHERE user_id = p_user_id;
END;
$$;

-- Deny public/anon access; grant to authenticated users and service_role only.
REVOKE ALL ON FUNCTION public.reset_user_data(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_user_data(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_user_data(uuid) TO service_role;
