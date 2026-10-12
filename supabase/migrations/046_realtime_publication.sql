-- Migration 046: stream row changes to signed-in clients over Supabase Realtime
-- so the app's cache can refetch a trip/group the moment another member
-- changes it (see docs/caching-todo.md, Phase 5).
--
-- Realtime applies each table's existing SELECT RLS policies to INSERT/UPDATE
-- events, so a client only hears about rows it could already read. DELETE
-- events can't be RLS-checked (the row is gone) and carry only the primary
-- key — an id, never content — which the client maps back to a cached bucket
-- or ignores.
--
-- splits is left out on purpose: its rows carry no trip/group id, and every
-- split write happens alongside a write to its parent expense row.
--
-- Idempotent: a table already in the publication is skipped.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'trips', 'trip_members', 'expenses', 'groups', 'group_members',
    'split_requests', 'recurring_expenses'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END
$$;
