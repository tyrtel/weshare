-- Migration 048: expenses.paid_by_user_id and splits.user_id uuid -> text.
--
-- Group guest members have ids like 'guest_<uuid>' (useAddGroupMember), so
-- saving a group expense paid by or split with a guest failed with
-- "invalid input syntax for type uuid". 020 dropped the users FKs for
-- placeholder members but left the uuid type; trip_members (027),
-- split_requests (034) and recurring_expenses (042) already use text.
--
-- This also fixes claim_member_slot / claim_group_member_slot /
-- claim_guest_session (015, 032), which compare these columns to text
-- parameters and so raised "operator does not exist: uuid = text".
--
-- Postgres refuses to change the type of a column a policy references, so the
-- three policies that read these columns are dropped and recreated with the
-- ::text cast.

DROP POLICY IF EXISTS "expenses: payer or owner can update" ON public.expenses;
DROP POLICY IF EXISTS "expenses: payer or owner can delete" ON public.expenses;
DROP POLICY IF EXISTS "splits: payer or owner can delete"   ON public.splits;

ALTER TABLE public.expenses ALTER COLUMN paid_by_user_id TYPE text USING paid_by_user_id::text;
ALTER TABLE public.splits   ALTER COLUMN user_id         TYPE text USING user_id::text;

CREATE POLICY "expenses: payer or owner can update"
  ON public.expenses FOR UPDATE
  USING (
    paid_by_user_id = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = expenses.trip_id AND t.owner_id = auth.uid()
    )
  );

CREATE POLICY "expenses: payer or owner can delete"
  ON public.expenses FOR DELETE
  USING (
    paid_by_user_id = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = expenses.trip_id AND t.owner_id = auth.uid()
    )
  );

CREATE POLICY "splits: payer or owner can delete"
  ON public.splits FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.expenses e
      WHERE e.id = splits.expense_id AND e.paid_by_user_id = auth.uid()::text
    )
    OR EXISTS (
      SELECT 1 FROM public.expenses e
      JOIN public.trips t ON t.id = e.trip_id
      WHERE e.id = splits.expense_id AND t.owner_id = auth.uid()
    )
  );
