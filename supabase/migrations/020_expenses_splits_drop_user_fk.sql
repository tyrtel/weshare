-- Migration 020: Drop user FK constraints from expenses and splits.
--
-- expenses.paid_by_user_id and splits.user_id both referenced public.users(id).
-- Guest trip members have client-generated UUIDs that do not exist in
-- public.users, so inserting an expense paid by a guest, or a split for a
-- guest, raised a FK violation.
--
-- RLS already controls who can read/write these rows, so the FK provided
-- no additional safety — only a constraint that prevented guest usage.

ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS expenses_paid_by_user_id_fkey;

ALTER TABLE public.splits
  DROP CONSTRAINT IF EXISTS splits_user_id_fkey;
