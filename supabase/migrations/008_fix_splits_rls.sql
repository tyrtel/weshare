-- SEC-3: Drop the overly permissive UPDATE policy on splits.
--
-- The old policy allowed any authenticated user to UPDATE their own split row
-- directly (including amount_paid_cents and settled_at), bypassing the entire
-- payment flow. Settlement must only happen via the stripe-webhook and
-- ob-webhook Edge Functions which run under the service-role key and therefore
-- bypass RLS. No legitimate client-side path needs to UPDATE a split record.

DROP POLICY IF EXISTS "splits: member can update own split" ON public.splits;
