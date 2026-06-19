-- Migration 022: Add avatar_url to trip_members.
--
-- Stores the member's profile picture URL at join time so it can be
-- displayed without a separate lookup on public.users (which is not
-- readable by other trip members due to RLS).
-- Nullable: guests and manually-added contacts have no avatar.

ALTER TABLE public.trip_members
  ADD COLUMN IF NOT EXISTS avatar_url text;
