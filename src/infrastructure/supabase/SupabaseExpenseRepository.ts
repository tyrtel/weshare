import { ok, err } from '../../core/types/Result';
import type { Result } from '../../core/types/Result';
import type { AppError } from '../../core/types/AppError';
import type { IExpenseRepository } from '../../core/interfaces/IExpenseRepository';
import type { Expense, ExpenseMetadata } from '../../core/models/Expense';
import type { Split } from '../../core/models/Split';
import { supabase } from './supabaseClient';
import { toAppError } from './supabaseErrors';
import { parseExpenseRow, parseSplitRow, mapRows } from './rowSchemas';

function rowToSplit(raw: unknown): Result<Split, AppError> {
  const parsed = parseSplitRow(raw);
  if (!parsed.ok) return parsed;
  const row = parsed.value;
  return ok({
    id:              row.id,
    expenseId:       row.expense_id,
    userId:          row.user_id,
    amountOwedCents: row.amount_owed_cents,
    amountPaidCents: row.amount_paid_cents,
    settledAt:       row.settled_at ? new Date(row.settled_at) : undefined,
  });
}

function rowToExpense(rawRow: unknown, rawSplits: unknown[]): Result<Expense, AppError> {
  const parsedExpense = parseExpenseRow(rawRow);
  if (!parsedExpense.ok) return parsedExpense;

  const splitsResult = mapRows(rawSplits, rowToSplit);
  if (!splitsResult.ok) return splitsResult;

  const row = parsedExpense.value;
  return ok({
    id:               row.id,
    tripId:           row.trip_id ?? undefined,
    groupId:          row.group_id ?? undefined,
    description:      row.description,
    totalAmountCents: row.total_amount_cents,
    currency:         row.currency,
    paidByUserId:     row.paid_by_user_id,
    createdAt:        new Date(row.created_at),
    settledAt:        row.settled_at ? new Date(row.settled_at) : null,
    metadata:         (row.metadata ?? {}) as ExpenseMetadata,
    splits:           splitsResult.value,
  });
}

// Must not exceed the project's PostgREST max_rows (Supabase default 1000): a
// short page is how the loop below knows it has reached the end.
const PAGE_SIZE = 1000;

export class SupabaseExpenseRepository implements IExpenseRepository {
  async getExpense(id: string): Promise<Result<Expense, AppError>> {
    const { data, error } = await supabase
      .from('expenses')
      .select('*, splits(*)')
      .eq('id', id)
      .single();
    if (error) return err(toAppError(error, 'Expense', id));
    const raw = data as { splits?: unknown[] } & Record<string, unknown>;
    return rowToExpense(raw, raw.splits ?? []);
  }

  async getExpensesForTrip(tripId: string): Promise<Result<Expense[], AppError>> {
    const { data, error } = await supabase
      .from('expenses')
      .select('*, splits(*)')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: true });
    if (error) return err(toAppError(error, 'Expense'));

    const expenses: Expense[] = [];
    for (const row of data as Array<{ splits?: unknown[] } & Record<string, unknown>>) {
      const result = rowToExpense(row, row.splits ?? []);
      if (!result.ok) return result;
      expenses.push(result.value);
    }
    return ok(expenses);
  }

  async getExpensesForTrips(tripIds: string[]): Promise<Result<Record<string, Expense[]>, AppError>> {
    const byTrip: Record<string, Expense[]> = Object.fromEntries(tripIds.map(id => [id, []]));
    if (tripIds.length === 0) return ok(byTrip);

    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from('expenses')
        .select('*, splits(*)')
        .in('trip_id', tripIds)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) return err(toAppError(error, 'Expense'));

      const rows = data as Array<{ splits?: unknown[] } & Record<string, unknown>>;
      for (const row of rows) {
        const result = rowToExpense(row, row.splits ?? []);
        if (!result.ok) return result;
        byTrip[result.value.tripId!].push(result.value);
      }
      if (rows.length < PAGE_SIZE) return ok(byTrip);
    }
  }

  async saveExpense(expense: Expense): Promise<Result<Expense, AppError>> {
    const { data, error } = await supabase
      .from('expenses')
      .insert({
        id:                 expense.id,
        trip_id:            expense.tripId ?? null,
        group_id:           expense.groupId ?? null,
        description:        expense.description,
        total_amount_cents: expense.totalAmountCents,
        currency:           expense.currency,
        paid_by_user_id:    expense.paidByUserId,
        metadata:           expense.metadata as Record<string, unknown>,
      })
      .select('*, splits(*)')
      .single();
    if (error) return err(toAppError(error, 'Expense', expense.id));
    const raw = data as { splits?: unknown[] } & Record<string, unknown>;
    return rowToExpense(raw, raw.splits ?? []);
  }

  async updateExpense(expense: Expense): Promise<Result<Expense, AppError>> {
    const { data, error } = await supabase
      .from('expenses')
      .update({
        description:        expense.description,
        total_amount_cents: expense.totalAmountCents,
        paid_by_user_id:    expense.paidByUserId,
        metadata:           expense.metadata as Record<string, unknown>,
      })
      .eq('id', expense.id)
      .select('*, splits(*)')
      .single();
    if (error) return err(toAppError(error, 'Expense', expense.id));
    const raw = data as { splits?: unknown[] } & Record<string, unknown>;
    return rowToExpense(raw, raw.splits ?? []);
  }

  async deleteExpense(id: string): Promise<Result<void, AppError>> {
    const { error } = await supabase.from('expenses').delete().eq('id', id);
    if (error) return err(toAppError(error, 'Expense', id));
    return ok(undefined);
  }

  async getExpensesForGroup(groupId: string): Promise<Result<Expense[], AppError>> {
    const { data, error } = await supabase
      .from('expenses')
      .select('*, splits(*)')
      .eq('group_id', groupId)
      .order('created_at', { ascending: true });
    if (error) return err(toAppError(error, 'Expense'));

    const expenses: Expense[] = [];
    for (const row of data as Array<{ splits?: unknown[] } & Record<string, unknown>>) {
      const result = rowToExpense(row, row.splits ?? []);
      if (!result.ok) return result;
      expenses.push(result.value);
    }
    return ok(expenses);
  }

  async settleExpense(id: string, settledAt: Date | null): Promise<Result<Expense, AppError>> {
    const { data, error } = await supabase
      .from('expenses')
      .update({ settled_at: settledAt ? settledAt.toISOString() : null })
      .eq('id', id)
      .select('*, splits(*)')
      .single();
    if (error) return err(toAppError(error, 'Expense', id));
    const raw = data as { splits?: unknown[] } & Record<string, unknown>;
    return rowToExpense(raw, raw.splits ?? []);
  }
}
