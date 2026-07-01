-- Returns the stored (plus-addressed) email for a given canonical form.
-- Used by the forgot-password flow so a user who enters user@gmail.com can
-- receive the reset code at user+weshare@gmail.com without us leaking the
-- plus tag back to the client in a visible way.
-- SECURITY DEFINER bypasses RLS; search_path is pinned.
CREATE OR REPLACE FUNCTION public.email_for_canonical(p_canonical text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email FROM public.users
  WHERE canonical_email = lower(trim(p_canonical))
  LIMIT 1;
$$;
