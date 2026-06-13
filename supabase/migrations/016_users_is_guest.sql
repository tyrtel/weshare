-- Migration 016: Add is_guest column to users table.
-- The initial schema only had is_guest on trip_members; the auth service
-- also needs it on users to track anonymous (Supabase anonymous auth) sessions.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_guest boolean NOT NULL DEFAULT false;
