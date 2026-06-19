-- Migration 019: Drop the FK constraint on trip_members.user_id.
--
-- The original schema assumed every trip member was a Supabase auth user,
-- so user_id referenced public.users(id). Guest participants (isGuest = true)
-- are not auth users — they have client-generated UUIDs that do not exist in
-- auth.users or public.users. The FK prevents inserting them.
--
-- Dropping the FK lets guests have arbitrary UUIDs while real members
-- continue to work exactly as before (their UUIDs still match auth.users).

ALTER TABLE public.trip_members
  DROP CONSTRAINT IF EXISTS trip_members_user_id_fkey;
