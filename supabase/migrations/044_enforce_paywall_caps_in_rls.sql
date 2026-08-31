-- Migration 044 (TODO_hardening.md §1): close the gap where the Chunk G
-- count-cap RPCs (can_create_group / can_create_recurring_expense,
-- 043_monetization_count_caps.sql) were only ever called client-side, before
-- the app's own insert — a client that skipped the app and inserted directly
-- into groups/recurring_expenses got past the free-tier cap entirely. Same
-- shape as increment_usage_if_allowed already being enforced *inside*
-- parse-receipt (the edge function), just applied at the RLS layer instead
-- since groups/recurring_expenses are plain client inserts with no edge
-- function in front of them.
--
-- Both cap functions are called by plain function call (`can_create_group()`),
-- not a raw FROM/JOIN subquery, so this does not add an edge to the
-- dependency graph rlsPolicyRecursion.test.ts checks — same pattern that
-- test's own header describes as the fix for the trips/trip_members and
-- groups/group_members recursion bugs (017, 026, 039).
--
-- Each previous FOR ALL policy is split into insert vs. update/delete so the
-- cap is only checked on create — renaming a group or editing a recurring
-- rule you already own/belong to must never require a free slot.

-- ── groups ───────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "group owner can write" ON groups;

CREATE POLICY "group owner can insert"
  ON groups FOR INSERT
  WITH CHECK (
    auth.uid()::text = owner_id
    AND (SELECT allowed FROM can_create_group())
  );

CREATE POLICY "group owner can update"
  ON groups FOR UPDATE
  USING (auth.uid()::text = owner_id);

CREATE POLICY "group owner can delete"
  ON groups FOR DELETE
  USING (auth.uid()::text = owner_id);

-- ── recurring_expenses ───────────────────────────────────────────────────────

DROP POLICY IF EXISTS "group members can write recurring expenses" ON recurring_expenses;

CREATE POLICY "group members can insert recurring expenses"
  ON recurring_expenses FOR INSERT
  WITH CHECK (
    is_group_member(group_id)
    AND (SELECT allowed FROM can_create_recurring_expense(group_id))
  );

CREATE POLICY "group members can update recurring expenses"
  ON recurring_expenses FOR UPDATE
  USING (is_group_member(group_id))
  WITH CHECK (is_group_member(group_id));

CREATE POLICY "group members can delete recurring expenses"
  ON recurring_expenses FOR DELETE
  USING (is_group_member(group_id));
