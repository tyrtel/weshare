-- Migration 021: Allow any trip member to insert splits.
--
-- The original "splits: payer can insert" policy required the inserting user
-- to be the expense payer (paid_by_user_id = auth.uid()) or the trip owner.
-- This breaks whenever someone records an expense paid by another person
-- (a guest or a different real member) — the expense row saves but the splits
-- INSERT fails under RLS, leaving an orphaned expense with no splits.
--
-- The fix mirrors the expense INSERT policy: any authenticated trip member
-- may insert splits for expenses in their trip. The Edge Function webhooks
-- (stripe-webhook, ob-webhook) run as service_role and bypass RLS regardless.

DROP POLICY IF EXISTS "splits: payer can insert" ON public.splits;

CREATE POLICY "splits: members can insert"
  ON public.splits FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.expenses e
      JOIN public.trips t ON t.id = e.trip_id
      WHERE e.id = splits.expense_id
        AND (
          t.owner_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.trip_members tm
            WHERE tm.trip_id = t.id AND tm.user_id = auth.uid()
          )
        )
    )
  );
