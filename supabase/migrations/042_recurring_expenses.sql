-- Adds the recurring_expenses / recurring_expense_splits tables.
--
-- Pre-existing gap: SupabaseRecurringExpenseRepository.ts, rowSchemas.ts, and
-- useCreateRecurringExpense have depended on this schema since the recurring
-- expenses feature shipped, but no migration ever actually created it — the
-- feature has had no real database backing in any environment that applies
-- these migrations. This fixes that; it is not itself a monetization change
-- (see 043_monetization_count_caps.sql for the Chunk G gate that depends on
-- this table existing).

CREATE TABLE recurring_expenses (
  id                  text        PRIMARY KEY,
  group_id            text        NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  description         text        NOT NULL,
  total_amount_cents  bigint      NOT NULL CHECK (total_amount_cents > 0),
  currency            text        NOT NULL,
  paid_by_user_id     text        NOT NULL,
  period              text        NOT NULL CHECK (period IN ('weekly', 'biweekly', 'monthly', 'quarterly')),
  start_date          date        NOT NULL,
  next_due_at         date        NOT NULL,
  last_spawned_at     timestamptz,
  paused_at           timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by_user_id  text        NOT NULL
);

CREATE INDEX recurring_expenses_group_idx ON recurring_expenses (group_id);
-- Supports the Chunk G count-cap check (active = paused_at IS NULL) and the
-- eventual spawn job's "what's due" query.
CREATE INDEX recurring_expenses_active_idx ON recurring_expenses (group_id) WHERE paused_at IS NULL;

CREATE TABLE recurring_expense_splits (
  id                    text   PRIMARY KEY,
  recurring_expense_id  text   NOT NULL REFERENCES recurring_expenses(id) ON DELETE CASCADE,
  user_id               text   NOT NULL,
  amount_owed_cents     bigint NOT NULL CHECK (amount_owed_cents >= 0)
);

CREATE INDEX recurring_expense_splits_re_idx ON recurring_expense_splits (recurring_expense_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Any group member (not just the owner) can manage the group's recurring
-- rules — same shared-expense trust model group expenses already use.
-- Reuses is_group_member() (026_fix_group_rls.sql) rather than a fresh
-- EXISTS subquery against group_members, since that helper already exists
-- for exactly this check and this table has no recursion risk to guard
-- against (unlike groups/group_members' own mutual policies).

ALTER TABLE recurring_expenses        ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_expense_splits  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "group members can read recurring expenses"
  ON recurring_expenses FOR SELECT
  USING (is_group_member(group_id));

CREATE POLICY "group members can write recurring expenses"
  ON recurring_expenses FOR ALL
  USING (is_group_member(group_id))
  WITH CHECK (is_group_member(group_id));

CREATE POLICY "group members can read recurring expense splits"
  ON recurring_expense_splits FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM recurring_expenses re
      WHERE re.id = recurring_expense_splits.recurring_expense_id
        AND is_group_member(re.group_id)
    )
  );

CREATE POLICY "group members can write recurring expense splits"
  ON recurring_expense_splits FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM recurring_expenses re
      WHERE re.id = recurring_expense_splits.recurring_expense_id
        AND is_group_member(re.group_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM recurring_expenses re
      WHERE re.id = recurring_expense_splits.recurring_expense_id
        AND is_group_member(re.group_id)
    )
  );
