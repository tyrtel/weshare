-- Defensive: explicit table-level grants for the three monetization tables added in
-- 040_monetization_entitlements.sql.
--
-- Found during Chunk C local sandbox testing: this repo's migrations never GRANT
-- table privileges to anon/authenticated/service_role directly — every existing table
-- (including foundational ones like users/trips) relies entirely on the default
-- privileges a Supabase project's platform bootstrap sets up once, at project
-- creation, outside of any migration file. `supabase start`'s local Postgres does not
-- reproduce that same bootstrap, so a fresh local stack denies these roles basic
-- table access (service_role's BYPASS RLS attribute skips RLS policies, but does not
-- imply or substitute for a GRANT). This is very likely a local-dev-only gap — if it
-- weren't, the app's existing service-role webhooks (stripe-webhook, ob-webhook)
-- would already be broken in production — but the fix is idempotent and harmless if
-- the hosted project already covers it via its own default privileges, so it's worth
-- having explicitly rather than depending on an assumption this repo has no way to
-- verify from a migration file alone.

-- authenticated only ever reads these tables directly (matching the "users read own
-- X" SELECT policies) — increment_usage_if_allowed is SECURITY DEFINER and writes
-- user_feature_usage as its owner, not as the calling role, so authenticated needs no
-- write grant here. service_role's webhook writes are an upsert with
-- `Prefer: resolution=ignore-duplicates` — verified directly against local PostgREST
-- that this plan requires SELECT in addition to INSERT even though the response
-- itself is `return=minimal` (confirmed via PostgREST's own permission-denied hint),
-- so service_role needs both, not INSERT alone.
GRANT SELECT             ON public.user_feature_usage   TO authenticated;
GRANT SELECT             ON public.trip_passes          TO authenticated;
GRANT SELECT             ON public.subscription_windows TO authenticated;
GRANT SELECT, INSERT     ON public.trip_passes          TO service_role;
GRANT SELECT, INSERT     ON public.subscription_windows TO service_role;
