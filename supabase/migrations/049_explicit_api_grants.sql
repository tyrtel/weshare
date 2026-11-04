-- Migration 049: explicit Data API grants on every existing public table.
--
-- Supabase used to grant anon/authenticated/service_role access to every new
-- table in public automatically. That default is gone (the opt-out was removed
-- on 2026-10-30): new tables get no grants, so the app sees "permission denied
-- for table ..." regardless of RLS. Production's existing tables still carry
-- the old grants, so this is a no-op there; it makes a fresh database (local
-- release tests, a new project) match production.
--
-- RLS stays the access control. From here on, every migration that creates a
-- table must grant it explicitly (enforced by supabase/__tests__/schemaRules.test.ts).

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
