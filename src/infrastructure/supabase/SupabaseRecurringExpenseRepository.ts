import { ok, err } from '../../core/types/Result';
import type { Result } from '../../core/types/Result';
import type { AppError } from '../../core/types/AppError';
import type { IRecurringExpenseRepository } from '../../core/interfaces/IRecurringExpenseRepository';
import type { RecurringExpense, RecurringExpenseSplit } from '../../core/models/RecurringExpense';
import { supabase } from './supabaseClient';
import { toAppError } from './supabaseErrors';
import {
  parseRecurringExpenseRow,
  parseRecurringExpenseSplitRow,
  mapRows,
} from './rowSchemas';

function rowToSplit(raw: unknown): Result<RecurringExpenseSplit, AppError> {
  const parsed = parseRecurringExpenseSplitRow(raw);
  if (!parsed.ok) return parsed;
  const row = parsed.value;
  return ok({
    id:                 row.id,
    recurringExpenseId: row.recurring_expense_id,
    userId:             row.user_id,
    amountOwedCents:    row.amount_owed_cents,
  });
}

type RawWithSplits = { recurring_expense_splits?: unknown[] } & Record<string, unknown>;

function rowToRecurringExpense(rawRow: unknown, rawSplits: unknown[]): Result<RecurringExpense, AppError> {
  const parsed = parseRecurringExpenseRow(rawRow);
  if (!parsed.ok) return parsed;

  const splitsResult = mapRows(rawSplits, rowToSplit);
  if (!splitsResult.ok) return splitsResult;

  const row = parsed.value;
  return ok({
    id:               row.id,
    groupId:          row.group_id,
    description:      row.description,
    totalAmountCents: row.total_amount_cents,
    currency:         row.currency,
    paidByUserId:     row.paid_by_user_id,
    period:           row.period,
    startDate:        new Date(row.start_date),
    nextDueAt:        new Date(row.next_due_at),
    lastSpawnedAt:    row.last_spawned_at ? new Date(row.last_spawned_at) : null,
    pausedAt:         row.paused_at ? new Date(row.paused_at) : null,
    createdAt:        new Date(row.created_at),
    createdByUserId:  row.created_by_user_id,
    splits:           splitsResult.value,
  });
}

export class SupabaseRecurringExpenseRepository implements IRecurringExpenseRepository {
  async getRecurringExpensesForGroup(groupId: string): Promise<Result<RecurringExpense[], AppError>> {
    const { data, error } = await supabase
      .from('recurring_expenses')
      .select('*, recurring_expense_splits(*)')
      .eq('group_id', groupId);
    if (error) return err(toAppError(error, 'RecurringExpense'));
    const results: RecurringExpense[] = [];
    for (const row of data ?? []) {
      const raw = row as RawWithSplits;
      const result = rowToRecurringExpense(raw, raw.recurring_expense_splits ?? []);
      if (!result.ok) return result;
      results.push(result.value);
    }
    return ok(results);
  }

  async saveRecurringExpense(re: RecurringExpense): Promise<Result<RecurringExpense, AppError>> {
    const { error: reError } = await supabase
      .from('recurring_expenses')
      .insert({
        id:                   re.id,
        group_id:             re.groupId,
        description:          re.description,
        total_amount_cents:   re.totalAmountCents,
        currency:             re.currency,
        paid_by_user_id:      re.paidByUserId,
        period:               re.period,
        start_date:           re.startDate.toISOString().slice(0, 10),
        next_due_at:          re.nextDueAt.toISOString().slice(0, 10),
        last_spawned_at:      re.lastSpawnedAt?.toISOString() ?? null,
        paused_at:            re.pausedAt?.toISOString() ?? null,
        created_at:           re.createdAt.toISOString(),
        created_by_user_id:   re.createdByUserId,
      });
    if (reError) return err(toAppError(reError, 'RecurringExpense', re.id));

    if (re.splits.length > 0) {
      const { error: splitError } = await supabase
        .from('recurring_expense_splits')
        .insert(re.splits.map(s => ({
          id:                   s.id,
          recurring_expense_id: re.id,
          user_id:              s.userId,
          amount_owed_cents:    s.amountOwedCents,
        })));
      if (splitError) return err(toAppError(splitError, 'RecurringExpenseSplit', re.id));
    }

    return ok(re);
  }

  async updateRecurringExpense(re: RecurringExpense): Promise<Result<RecurringExpense, AppError>> {
    const { error: reError } = await supabase
      .from('recurring_expenses')
      .update({
        description:        re.description,
        total_amount_cents: re.totalAmountCents,
        currency:           re.currency,
        paid_by_user_id:    re.paidByUserId,
        period:             re.period,
        start_date:         re.startDate.toISOString().slice(0, 10),
        next_due_at:        re.nextDueAt.toISOString().slice(0, 10),
      })
      .eq('id', re.id);
    if (reError) return err(toAppError(reError, 'RecurringExpense', re.id));

    const { error: deleteError } = await supabase
      .from('recurring_expense_splits')
      .delete()
      .eq('recurring_expense_id', re.id);
    if (deleteError) return err(toAppError(deleteError, 'RecurringExpenseSplit', re.id));

    if (re.splits.length > 0) {
      const { error: splitError } = await supabase
        .from('recurring_expense_splits')
        .insert(re.splits.map(s => ({
          id:                   s.id,
          recurring_expense_id: re.id,
          user_id:              s.userId,
          amount_owed_cents:    s.amountOwedCents,
        })));
      if (splitError) return err(toAppError(splitError, 'RecurringExpenseSplit', re.id));
    }

    return ok(re);
  }

  async deleteRecurringExpense(id: string): Promise<Result<void, AppError>> {
    const { error } = await supabase
      .from('recurring_expenses')
      .delete()
      .eq('id', id);
    if (error) return err(toAppError(error, 'RecurringExpense', id));
    return ok(undefined);
  }

  async pauseRecurringExpense(id: string): Promise<Result<RecurringExpense, AppError>> {
    const { data, error } = await supabase
      .from('recurring_expenses')
      .update({ paused_at: new Date().toISOString() })
      .eq('id', id)
      .select('*, recurring_expense_splits(*)')
      .single();
    if (error) return err(toAppError(error, 'RecurringExpense', id));
    const raw = data as RawWithSplits;
    return rowToRecurringExpense(raw, raw.recurring_expense_splits ?? []);
  }

  async resumeRecurringExpense(id: string): Promise<Result<RecurringExpense, AppError>> {
    const { data, error } = await supabase
      .from('recurring_expenses')
      .update({ paused_at: null })
      .eq('id', id)
      .select('*, recurring_expense_splits(*)')
      .single();
    if (error) return err(toAppError(error, 'RecurringExpense', id));
    const raw = data as RawWithSplits;
    return rowToRecurringExpense(raw, raw.recurring_expense_splits ?? []);
  }
}
