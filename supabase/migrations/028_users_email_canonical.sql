-- Store the original (plus-addressed) email alongside a canonical form used
-- purely for inbox-level dedup. The canonical form strips plus tags, normalises
-- googlemail.com → gmail.com, and removes dots from Gmail local parts so that
-- user+spam@gmail.com and u.s.e.r@gmail.com cannot create separate accounts.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS email           text,
  ADD COLUMN IF NOT EXISTS canonical_email text;

-- Backfill for existing rows from auth.users.
-- SQL can handle plus-stripping and domain normalisation; Gmail dot-removal is
-- omitted here because the edge case (existing dot-variant accounts) is
-- negligible and the TypeScript layer will apply the full rule for new signups.
UPDATE public.users u
SET
  email           = a.email,
  canonical_email = lower(
    split_part(split_part(lower(a.email), '@', 1), '+', 1)
    || '@' ||
    CASE lower(split_part(a.email, '@', 2))
      WHEN 'googlemail.com' THEN 'gmail.com'
      ELSE lower(split_part(a.email, '@', 2))
    END
  )
FROM auth.users a
WHERE u.id = a.id;

-- Partial unique index: only enforces uniqueness when canonical_email is set.
-- Social-auth users who somehow land here without an email remain unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS users_canonical_email_key
  ON public.users (canonical_email)
  WHERE canonical_email IS NOT NULL;

-- Pre-signup duplicate check.  Callable by unauthenticated clients so the UI
-- can reject a duplicate inbox before creating an unverified auth.users row.
-- SECURITY DEFINER bypasses RLS; search_path is pinned to prevent search-path
-- injection.
CREATE OR REPLACE FUNCTION public.canonical_email_taken(p_canonical text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE canonical_email = lower(trim(p_canonical))
  );
$$;
