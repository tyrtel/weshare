# Recurring Expenses in Groups — Design Analysis

**Status:** Analysis / pre-implementation  
**Scope:** Groups only (not trips). P2P recurring transfers are out of scope.

---

## Recurrence Options

Keeping it simple. Four periods, no custom intervals, no day-of-week selection, no "every Nth weekday":

| Key | Label | Interval |
|---|---|---|
| `weekly` | Every week | 7 days |
| `biweekly` | Every 2 weeks | 14 days |
| `monthly` | Every month | Calendar month, same day |
| `quarterly` | Every 3 months | Calendar quarter, same day |

Monthly and quarterly use the calendar correctly — monthly from Jan 31 lands on Feb 28/29, not skipped. Everything else is a fixed-day addition.

This covers the realistic cases for a shared household or friend group: weekly chores pool, biweekly cleaner, monthly rent/utilities, quarterly subscriptions.

---

## Data Model

### New table: `recurring_expenses`

    CREATE TABLE recurring_expenses (
      id                  text        PRIMARY KEY,
      group_id            text        NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      description         text        NOT NULL,
      total_amount_cents  bigint      NOT NULL CHECK (total_amount_cents > 0),
      currency            text        NOT NULL,
      paid_by_user_id     text        NOT NULL,
      period              text        NOT NULL CHECK (period IN ('weekly','biweekly','monthly','quarterly')),
      start_date          date        NOT NULL,
      next_due_at         date        NOT NULL,
      last_spawned_at     date,
      paused_at           timestamptz,
      created_at          timestamptz NOT NULL DEFAULT now(),
      created_by_user_id  text        NOT NULL
    );

### New table: `recurring_expense_splits`

Stores the split template — fixed cent amounts per person. When an expense is spawned, these become the real `splits` rows.

    CREATE TABLE recurring_expense_splits (
      id                     text    PRIMARY KEY,
      recurring_expense_id   text    NOT NULL REFERENCES recurring_expenses(id) ON DELETE CASCADE,
      user_id                text    NOT NULL,
      amount_owed_cents      bigint  NOT NULL CHECK (amount_owed_cents > 0),
      UNIQUE (recurring_expense_id, user_id)
    );

**Why fixed amounts rather than proportions:**  
Proportions require re-computing amounts at spawn time and introduce edge cases when the group's membership changes mid-month. Fixed amounts are explicit — what the user configured is exactly what gets created. If they add a new member or the amount changes, they edit the template.

### Change to the `expenses` table

Add a nullable back-reference so spawned expenses know their origin:

    ALTER TABLE expenses
      ADD COLUMN recurring_expense_id text REFERENCES recurring_expenses(id) ON DELETE SET NULL;

This lets the UI show a "Recurring" badge on the expense card and lets the group detail screen group or filter by template.

### TypeScript model additions

    type RecurrencePeriod = 'weekly' | 'biweekly' | 'monthly' | 'quarterly';

    interface RecurringExpense {
      id:                 string;
      groupId:            string;
      description:        string;
      totalAmountCents:   number;
      currency:           string;
      paidByUserId:       string;
      period:             RecurrencePeriod;
      startDate:          Date;
      nextDueAt:          Date;
      lastSpawnedAt:      Date | null;
      pausedAt:           Date | null;
      createdAt:          Date;
      createdByUserId:    string;
      splits:             RecurringExpenseSplit[];
    }

    interface RecurringExpenseSplit {
      id:                   string;
      recurringExpenseId:   string;
      userId:               string;
      amountOwedCents:      number;
    }

`Expense.metadata` already has a `notes` field. Rather than overloading it, the back-reference lives on a first-class `recurring_expense_id` column as described above.

---

## Spawning Mechanism

### Why not app-triggered

The obvious first idea is: when a group member opens the group detail, check if any recurring expenses are overdue and create them. This is tempting because it requires no server infrastructure.

**Problems:**

- If no member opens the app, the expense is never created. A group whose rent goes unrecorded for a week is silently wrong.
- Race condition: two members open the app simultaneously, both see the same `next_due_at` in the past, both try to spawn — you get duplicate expenses. Solvable with a unique constraint and retry logic, but now you have concurrency handling in the app.
- On mobile, background fetch is unreliable — iOS kills tasks aggressively, Android restricts battery-saver mode.

The correct place for scheduled work is the server.

### Recommended approach: pg_cron + SECURITY DEFINER function

Supabase ships with `pg_cron` enabled on the Pro plan. A single daily job calls a `SECURITY DEFINER` PL/pgSQL function that:

1. Finds all recurring expenses where `next_due_at <= CURRENT_DATE` and `paused_at IS NULL`
2. For each, inserts a new row into `expenses` and a set of rows into `splits`
3. Advances `next_due_at` and sets `last_spawned_at`

This is fully atomic (wrapped in a transaction per recurring expense), runs without any app being open, and has no cold-start latency.

### The spawner function

    CREATE OR REPLACE FUNCTION spawn_due_recurring_expenses()
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      rec     recurring_expenses%ROWTYPE;
      new_id  text;
    BEGIN
      FOR rec IN
        SELECT * FROM recurring_expenses
        WHERE next_due_at <= CURRENT_DATE
          AND paused_at IS NULL
        FOR UPDATE SKIP LOCKED
      LOOP
        new_id := gen_random_uuid()::text;

        INSERT INTO expenses (
          id, group_id, description, total_amount_cents,
          currency, paid_by_user_id, created_at,
          settled_at, metadata, recurring_expense_id
        )
        VALUES (
          new_id,
          rec.group_id,
          rec.description,
          rec.total_amount_cents,
          rec.currency,
          rec.paid_by_user_id,
          now(),
          NULL,
          '{}',
          rec.id
        );

        INSERT INTO splits (id, expense_id, user_id, amount_owed_cents, amount_paid_cents)
        SELECT
          gen_random_uuid()::text,
          new_id,
          res.user_id,
          res.amount_owed_cents,
          0
        FROM recurring_expense_splits res
        WHERE res.recurring_expense_id = rec.id;

        UPDATE recurring_expenses
        SET
          last_spawned_at = CURRENT_DATE,
          next_due_at = CASE rec.period
            WHEN 'weekly'    THEN rec.next_due_at + INTERVAL '7 days'
            WHEN 'biweekly'  THEN rec.next_due_at + INTERVAL '14 days'
            WHEN 'monthly'   THEN rec.next_due_at + INTERVAL '1 month'
            WHEN 'quarterly' THEN rec.next_due_at + INTERVAL '3 months'
          END
        WHERE id = rec.id;

      END LOOP;
    END;
    $$;

    SELECT cron.schedule(
      'spawn-recurring-expenses',
      '0 6 * * *',           -- 06:00 UTC daily
      'SELECT spawn_due_recurring_expenses()'
    );

`FOR UPDATE SKIP LOCKED` prevents a double-fire if the cron job is somehow called twice concurrently. `SECURITY DEFINER` lets the function write to `expenses` and `splits` without needing a user's RLS context — the function itself enforces correctness by only inserting for valid `recurring_expenses` rows.

### Handling missed firings

If the cron job fails for a day (Supabase incident, project pause), `next_due_at` will be in the past by multiple periods. The loop above finds all due rows and fires once per row — it does not loop to catch up multiple missed periods. This is intentional: spawning six months of back-rent because the project was paused would be surprising and wrong. Catching up is a manual action.

If you want automatic catch-up (e.g., for a weekly shopping pool that was genuinely missed), the loop body could be wrapped in a `WHILE rec.next_due_at <= CURRENT_DATE` inner loop. Not recommended for v1.

### Calculating `next_due_at` correctly for edge dates

PostgreSQL's `+ INTERVAL '1 month'` already handles end-of-month correctly:

    SELECT DATE '2024-01-31' + INTERVAL '1 month';  -- → 2024-02-29 (leap year)
    SELECT DATE '2024-01-31' + INTERVAL '1 month';  -- → 2024-02-28 (non-leap)

No custom clamping needed.

---

## App-Side Integration

Following the existing 4-step DI pattern:

**Step 1 — Interface: `src/core/interfaces/IRecurringExpenseRepository.ts`**

    interface IRecurringExpenseRepository {
      getRecurringExpensesForGroup(groupId: string): Promise<Result<RecurringExpense[], AppError>>;
      saveRecurringExpense(re: RecurringExpense, splits: RecurringExpenseSplit[]): Promise<Result<RecurringExpense, AppError>>;
      updateRecurringExpense(re: RecurringExpense, splits: RecurringExpenseSplit[]): Promise<Result<RecurringExpense, AppError>>;
      deleteRecurringExpense(id: string): Promise<Result<void, AppError>>;
      pauseRecurringExpense(id: string): Promise<Result<RecurringExpense, AppError>>;
      resumeRecurringExpense(id: string): Promise<Result<RecurringExpense, AppError>>;
    }

**Step 2 — Production impl: `src/infrastructure/supabase/SupabaseRecurringExpenseRepository.ts`**

Standard Supabase select/insert/update/delete implementation, with a `recurring_expense_splits` joined fetch on get. Identical in structure to `SupabaseGroupRepository`.

**Step 3 — Mock: `src/__mocks__/InMemoryRecurringExpenseRepository.ts`**

In-memory Map, same pattern as `InMemoryGroupRepository`.

**Step 4 — Register in both containers**

Add `RECURRING_EXPENSE_REPO` token to `tokens.ts`, register `SupabaseRecurringExpenseRepository` in `productionContainer.ts` and `InMemoryRecurringExpenseRepository` in `testContainer.ts`.

### Hooks

    useRecurringExpenses(groupId)
    // Returns: { recurringExpenses: RecurringExpense[], loading, error }
    // Reads from TRIP_STORE or fetches on mount (same Zustand pattern as useGroupDetail)

    useCreateRecurringExpense(groupId)
    // Returns: { createRecurringExpense(input), loading, error }
    // Validates: description non-empty, amount > 0, splits sum === totalAmountCents,
    //            period is one of the four valid values, startDate is not in the past

    useEditRecurringExpense()
    // Returns: { editRecurringExpense(re, splits), loading, error }

    useDeleteRecurringExpense()
    // Returns: { deleteRecurringExpense(id), loading, error }

    usePauseRecurringExpense()
    // Returns: { pause(id), resume(id), loading, error }

### Zustand store extension

The `TRIP_STORE` holds group expenses. It should also hold recurring expenses for a loaded group:

    // Add to ITripSessionStore
    recurringExpensesByGroup: Map<string, RecurringExpense[]>;
    setRecurringExpensesForGroup(groupId: string, items: RecurringExpense[]): void;
    appendRecurringExpense(re: RecurringExpense): void;
    removeRecurringExpense(id: string): void;
    updateRecurringExpenseInStore(re: RecurringExpense): void;

---

## UI Touchpoints

**Group detail screen**

A "Recurring" section (collapsed by default, expand chevron) below the expense list. Shows a summary card per template: description, amount, period, next due date, paused badge if applicable. Tapping a card opens an edit sheet.

A "+" FAB option "Add recurring expense" alongside the existing expense and trip options.

**Group expense add screen (or new dedicated screen)**

Identical to the current add-expense screen plus a "Repeat" picker row at the bottom. The picker shows:

- Never (default, for one-off expenses)
- Every week
- Every 2 weeks
- Every month
- Every 3 months

If "Never" is not selected, `startDate` defaults to today. Submitting with a recurrence creates the `recurring_expenses` row instead of (or in addition to?) the first `expenses` row.

**Decision point:** should the first occurrence be created immediately on save, or wait for the cron? Recommendation: create it immediately on save (the hook calls `useCreateGroupExpense` for the first instance, then saves the `recurring_expense` template). This makes the first expense appear right away. Subsequent ones come from the cron.

**Expense card badge**

Expenses spawned by the cron have `recurring_expense_id` set. The expense card can show a small "Recurring" chip or a repeat icon to distinguish them from one-off expenses.

---

## RLS for the New Tables

    ALTER TABLE recurring_expenses        ENABLE ROW LEVEL SECURITY;
    ALTER TABLE recurring_expense_splits  ENABLE ROW LEVEL SECURITY;

    -- Any group member can read recurring expenses for their group
    CREATE POLICY "group members can read recurring expenses"
      ON recurring_expenses FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM group_members gm
          WHERE gm.group_id = recurring_expenses.group_id
            AND gm.user_id = auth.uid()::text
        )
      );

    -- Any group member can create recurring expenses
    CREATE POLICY "group members can create recurring expenses"
      ON recurring_expenses FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM group_members gm
          WHERE gm.group_id = recurring_expenses.group_id
            AND gm.user_id = auth.uid()::text
        )
      );

    -- Only the creator can update or delete
    CREATE POLICY "creator can modify recurring expenses"
      ON recurring_expenses FOR ALL
      USING (created_by_user_id = auth.uid()::text);

    -- Splits inherit group-member read access via join
    CREATE POLICY "group members can read recurring splits"
      ON recurring_expense_splits FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM recurring_expenses re
          JOIN group_members gm ON gm.group_id = re.group_id
          WHERE re.id = recurring_expense_splits.recurring_expense_id
            AND gm.user_id = auth.uid()::text
        )
      );

    CREATE POLICY "creator can manage recurring splits"
      ON recurring_expense_splits FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM recurring_expenses re
          WHERE re.id = recurring_expense_splits.recurring_expense_id
            AND re.created_by_user_id = auth.uid()::text
        )
      );

The `SECURITY DEFINER` spawner function bypasses RLS (it runs as the function owner), so the cron inserts work regardless of the user context. Selects on the resulting `expenses` rows are still governed by the existing expense RLS.

---

## Edge Cases and Decisions

**Member removed from group after template created**

Their `user_id` still lives in `recurring_expense_splits`. The spawn function inserts a `splits` row with that user_id. The split remains, the balance is attributed to them. This is correct — they were on the hook for that period if they were a member when the expense occurred.

If you want auto-cleanup: add a cascade delete from `group_members` to `recurring_expense_splits`. Not recommended — you'd silently change the split amounts (the totals would no longer add up to `total_amount_cents`).

**Editing a template after expenses have already been spawned**

Past spawned expenses are unchanged. Only future ones reflect the new template. This is the expected behaviour (you can't retroactively change what was already logged).

**Pausing vs. deleting**

Pause (`paused_at IS NOT NULL`) means the cron skips it but the template stays. Useful for "we're all travelling in August". Resume clears `paused_at` and leaves `next_due_at` as it was (so the next spawn fires on the originally scheduled date, not immediately — avoids a catch-up surprise).

Delete removes the template. Past expenses remain (they have `recurring_expense_id` set to the deleted row, which becomes NULL via `ON DELETE SET NULL`).

**`next_due_at` on template creation**

Set to `start_date`. The cron spawns the first expense as soon as `CURRENT_DATE >= start_date`. If you want the app to create the first expense immediately (described above), set `next_due_at = start_date + 1 period` when saving the template so the cron doesn't double-spawn.

---

## What is Out of Scope for v1

- Custom intervals ("every 10 days")
- Day-of-week selection ("every Monday")
- End date / number of occurrences limit
- Variable amounts (amount changes each period)
- Per-member rotation of who pays
- Push notification when an expense is spawned
- Viewing the spawn history of a template

These can be added later without a schema change except for "end date" (easy `ends_at date` column) and "rotation" (a more complex split template structure).
