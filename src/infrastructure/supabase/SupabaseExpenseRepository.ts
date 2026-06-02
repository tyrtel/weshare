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
    tripId:           row.trip_id,
    description:      row.description,
    totalAmountCents: row.total_amount_cents,
    currency:         row.currency,
    paidByUserId:     row.paid_by_user_id,
    createdAt:        new Date(row.created_at),
    metadata:         (row.metadata ?? {}) as ExpenseMetadata,
    splits:           splitsResult.value,
  });
}

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

  async saveExpense(expense: Expense): Promise<Result<Expense, AppError>> {
    const { data, error } = await supabase
      .from('expenses')
      .insert({
        id:                 expense.id,
        trip_id:            expense.tripId,
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
}
