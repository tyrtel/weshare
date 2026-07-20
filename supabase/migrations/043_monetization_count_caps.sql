-- Chunk G (TODO_monetization.md): count-cap gate for groups and recurring
-- expenses. Distinct shape from increment_usage_if_allowed (040) — that one
-- is a cumulative lifetime counter (a scan/export used is used forever);
-- these are a count of currently-active rows, so closing/pausing one frees
-- the slot back up. No table to increment here — the cap check simply counts
-- existing rows. Same override -> subscription -> cap precedence throughout.

-- ── Groups: 1 free active group per user ──────────────────────────────────────
-- "Active" is every group the user owns — there is no archive/delete concept
-- for groups in this app (unlike recurring expenses' paused_at), so the count
-- is simply how many rows exist. That already gives the intended behavior: a
-- user who created their one free group before a subscription lapses keeps it
-- fully working, they just can't create a second one until they pay.
CREATE OR REPLACE FUNCTION can_create_group(
  p_max_free int DEFAULT 1
) RETURNS TABLE (allowed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id  text := auth.uid()::text;
  v_override boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN QUERY SELECT false;
    RETURN;
  END IF;

  SELECT full_access_override INTO v_override
  FROM users WHERE id = auth.uid();

  IF v_override THEN
    RETURN QUERY SELECT true;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM subscription_windows
    WHERE user_id = v_user_id AND expires_at > now()
  ) THEN
    RETURN QUERY SELECT true;
    RETURN;
  END IF;

  RETURN QUERY SELECT (
    SELECT count(*) FROM groups WHERE owner_id = v_user_id
  ) < p_max_free;
END;
$$;

REVOKE ALL ON FUNCTION can_create_group(int) FROM public;
GRANT EXECUTE ON FUNCTION can_create_group(int) TO authenticated;

-- ── Recurring expenses: 1 free active rule per group ──────────────────────────
-- Scoped to the group, not the calling user — any group member creating a
-- second rule hits the same wall, matching the shared-expense trust model
-- recurring_expenses' own RLS already uses (042_recurring_expenses.sql).
-- The calling user's OWN override/subscription still bypasses it regardless
-- of who created the group's existing rule(s).
CREATE OR REPLACE FUNCTION can_create_recurring_expense(
  p_group_id  text,
  p_max_free  int DEFAULT 1
) RETURNS TABLE (allowed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id  text := auth.uid()::text;
  v_override boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN QUERY SELECT false;
    RETURN;
  END IF;

  SELECT full_access_override INTO v_override
  FROM users WHERE id = auth.uid();

  IF v_override THEN
    RETURN QUERY SELECT true;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM subscription_windows
    WHERE user_id = v_user_id AND expires_at > now()
  ) THEN
    RETURN QUERY SELECT true;
    RETURN;
  END IF;

  RETURN QUERY SELECT (
    SELECT count(*) FROM recurring_expenses
    WHERE group_id = p_group_id AND paused_at IS NULL
  ) < p_max_free;
END;
$$;

REVOKE ALL ON FUNCTION can_create_recurring_expense(text, int) FROM public;
GRANT EXECUTE ON FUNCTION can_create_recurring_expense(text, int) TO authenticated;
