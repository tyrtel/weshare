-- Migration 047: RLS for group expenses and their splits.
--
-- 025_groups.sql added expenses.group_id (and made trip_id nullable) but no
-- policy ever covered a row with group_id set: every expenses/splits policy
-- joins through trip_id. Inserting a group one-time expense therefore failed
-- with "new row violates row-level security policy for table expenses", and
-- group expenses/splits were unreadable.
--
-- Permissive policies OR together, so these sit beside the trip policies
-- without touching them. Group creation always adds the owner to
-- group_members, so is_group_member() covers the owner too. Update/delete
-- mirror the trip rules: the payer (already allowed by the 001 policies) or
-- the group owner.

-- ── expenses ─────────────────────────────────────────────────────────────────

CREATE POLICY "expenses: group members can read"
  ON public.expenses FOR SELECT
  USING (group_id IS NOT NULL AND is_group_member(group_id));

CREATE POLICY "expenses: group members can insert"
  ON public.expenses FOR INSERT
  WITH CHECK (group_id IS NOT NULL AND is_group_member(group_id));

CREATE POLICY "expenses: group owner can update"
  ON public.expenses FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.groups g
      WHERE g.id = expenses.group_id AND g.owner_id = auth.uid()::text
    )
  );

CREATE POLICY "expenses: group owner can delete"
  ON public.expenses FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.groups g
      WHERE g.id = expenses.group_id AND g.owner_id = auth.uid()::text
    )
  );

-- ── splits ───────────────────────────────────────────────────────────────────

CREATE POLICY "splits: group members can read"
  ON public.splits FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.expenses e
      WHERE e.id = splits.expense_id
        AND e.group_id IS NOT NULL
        AND is_group_member(e.group_id)
    )
  );

CREATE POLICY "splits: group members can insert"
  ON public.splits FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.expenses e
      WHERE e.id = splits.expense_id
        AND e.group_id IS NOT NULL
        AND is_group_member(e.group_id)
    )
  );

CREATE POLICY "splits: group owner can delete"
  ON public.splits FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.expenses e
      JOIN public.groups g ON g.id = e.group_id
      WHERE e.id = splits.expense_id AND g.owner_id = auth.uid()::text
    )
  );
