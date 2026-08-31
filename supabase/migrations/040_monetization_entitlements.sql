-- Monetization entitlement foundation (TODO_monetization.md, Chunk A).
-- Adds lifetime usage counters for gated features, one-time per-trip passes,
-- rolling-window subscriptions, and a user-level override flag for
-- friends/testers. No store integration yet — RevenueCat writes into
-- trip_passes/subscription_windows via a webhook in a later migration.

-- ── user_feature_usage ────────────────────────────────────────────────────────
-- Lifetime (never reset) usage counters for the free-tier sample of each
-- gated feature. user_id is text, not uuid, to match every other
-- client-identity column in this schema (trip_members.user_id,
-- device_tokens.user_id, ...) — compared against auth.uid()::text.

CREATE TABLE user_feature_usage (
  user_id     text NOT NULL,
  feature     text NOT NULL CHECK (feature IN ('ocr_scan', 'report_export')),
  used_count  int  NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, feature)
);

-- ── trip_passes ───────────────────────────────────────────────────────────────
-- One-time unlock scoped to a single trip, hard-capped at 30 days from
-- purchase regardless of the trip's own status. Rows are written only by the
-- RevenueCat webhook (service role) — store_transaction_id is the webhook's
-- idempotency key.

CREATE TABLE trip_passes (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               text        NOT NULL,
  trip_id               uuid        NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  purchased_at          timestamptz NOT NULL DEFAULT now(),
  expires_at            timestamptz NOT NULL,
  store_transaction_id  text        NOT NULL UNIQUE
);

CREATE INDEX trip_passes_user_trip_idx ON trip_passes (user_id, trip_id);

-- ── subscription_windows ──────────────────────────────────────────────────────
-- Single-expiry model rather than discrete day-passes: each renewal computes
-- max(now, currentExpiry) + 30 days (see core/logic/entitlement.ts), so
-- unused days ride out after cancelling and stacked renewals never lose days.
-- Written only by the RevenueCat webhook, same idempotency pattern as above.

CREATE TABLE subscription_windows (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               text        NOT NULL,
  started_at            timestamptz NOT NULL DEFAULT now(),
  expires_at            timestamptz NOT NULL,
  store_transaction_id  text        NOT NULL UNIQUE
);

CREATE INDEX subscription_windows_user_idx ON subscription_windows (user_id);

-- ── users.full_access_override ────────────────────────────────────────────────

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS full_access_override boolean NOT NULL DEFAULT false;

-- Deliberately not writable through any client-facing path — only via direct
-- SQL / the Supabase dashboard, same trust boundary as an admin flag. The
-- existing "users: update own row" policy (001_initial_schema.sql) has no
-- column-level restriction, so without this trigger a client could set its
-- own full_access_override through the same call it uses to update its name.
-- The trigger only intercepts requests carrying a Supabase API role
-- (authenticated/anon); direct SQL sessions (dashboard, service role,
-- migrations) have no such role claim and pass through untouched.
CREATE OR REPLACE FUNCTION public.lock_full_access_override()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.role() IN ('authenticated', 'anon') THEN
    NEW.full_access_override := OLD.full_access_override;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER users_lock_full_access_override
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.lock_full_access_override();

-- ── RLS ────────────────────────────────────────────────────────────────────────

ALTER TABLE user_feature_usage   ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_passes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_windows ENABLE ROW LEVEL SECURITY;

-- Read-only for the owning user (UI display: "3 of 5 scans used", trip pass /
-- subscription expiry). No client-facing insert/update/delete policy exists
-- on any of the three tables — writes go only through increment_usage_if_allowed
-- below (SECURITY DEFINER) or the service-role webhook.
CREATE POLICY "users read own feature usage"
  ON user_feature_usage FOR SELECT
  USING (user_id = auth.uid()::text);

CREATE POLICY "users read own trip passes"
  ON trip_passes FOR SELECT
  USING (user_id = auth.uid()::text);

CREATE POLICY "users read own subscription windows"
  ON subscription_windows FOR SELECT
  USING (user_id = auth.uid()::text);

-- ── increment_usage_if_allowed ───────────────────────────────────────────────
-- Atomically checks entitlement precedence (override -> active subscription
-- -> active trip pass, if p_trip_id given -> free-tier cap) and, only in the
-- free-tier branch, increments the usage counter. Mirrors
-- check_report_rate_limit's shape (038_report_rate_limit.sql): no user-id
-- parameter, caller identity always comes from auth.uid() so a client can
-- never spoof or spam another user's usage.
--
-- p_trip_id is optional because OCR/report usage isn't itself trip-scoped
-- (the cap is per-user), but an active trip pass unlocks unlimited use
-- *within that trip* — passing the trip in context lets that pass apply.
-- QA-build unlock is intentionally not checked here: it's a client-only,
-- env-var-gated bypass (see TODO_monetization.md) that never reaches this
-- RPC in the first place.
CREATE OR REPLACE FUNCTION increment_usage_if_allowed(
  p_feature   text,
  p_trip_id   uuid DEFAULT NULL,
  p_max_free  int  DEFAULT 5
) RETURNS TABLE (allowed boolean, remaining int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id  text := auth.uid()::text;
  v_override boolean;
  v_used     int;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN QUERY SELECT false, 0;
    RETURN;
  END IF;

  SELECT full_access_override INTO v_override
  FROM users WHERE id = auth.uid();

  IF v_override THEN
    RETURN QUERY SELECT true, NULL::int;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM subscription_windows
    WHERE user_id = v_user_id AND expires_at > now()
  ) THEN
    RETURN QUERY SELECT true, NULL::int;
    RETURN;
  END IF;

  IF p_trip_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM trip_passes
    WHERE user_id = v_user_id AND trip_id = p_trip_id AND expires_at > now()
  ) THEN
    RETURN QUERY SELECT true, NULL::int;
    RETURN;
  END IF;

  SELECT used_count INTO v_used
  FROM user_feature_usage
  WHERE user_id = v_user_id AND feature = p_feature;

  v_used := COALESCE(v_used, 0);

  IF v_used >= p_max_free THEN
    RETURN QUERY SELECT false, 0;
    RETURN;
  END IF;

  INSERT INTO user_feature_usage (user_id, feature, used_count)
  VALUES (v_user_id, p_feature, 1)
  ON CONFLICT (user_id, feature)
  DO UPDATE SET used_count = user_feature_usage.used_count + 1;

  RETURN QUERY SELECT true, (p_max_free - v_used - 1);
END;
$$;

REVOKE ALL ON FUNCTION increment_usage_if_allowed(text, uuid, int) FROM public;
GRANT EXECUTE ON FUNCTION increment_usage_if_allowed(text, uuid, int) TO authenticated;
