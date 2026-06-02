import { ok, err } from '../../core/types/Result';
import type { Result } from '../../core/types/Result';
import type { AppError } from '../../core/types/AppError';
import type { ISplitRepository } from '../../core/interfaces/ISplitRepository';
import type { Split } from '../../core/models/Split';
import { supabase } from './supabaseClient';
import { toAppError } from './supabaseErrors';
import { parseSplitRow, mapRows } from './rowSchemas';

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

export class SupabaseSplitRepository implements ISplitRepository {
  async getSplit(id: string): Promise<Result<Split, AppError>> {
    const { data, error } = await supabase
      .from('splits')
      .select()
      .eq('id', id)
      .single();
    if (error) return err(toAppError(error, 'Split', id));
    return rowToSplit(data);
  }

  async getSplitsForExpense(expenseId: string): Promise<Result<Split[], AppError>> {
    const { data, error } = await supabase
      .from('splits')
      .select()
      .eq('expense_id', expenseId);
    if (error) return err(toAppError(error, 'Split'));
    return mapRows(data as unknown[], rowToSplit);
  }

  async saveSplit(split: Split): Promise<Result<Split, AppError>> {
    const { data, error } = await supabase
      .from('splits')
      .insert({
        id:                split.id,
        expense_id:        split.expenseId,
        user_id:           split.userId,
        amount_owed_cents: split.amountOwedCents,
        amount_paid_cents: split.amountPaidCents,
        settled_at:        split.settledAt?.toISOString() ?? null,
      })
      .select()
      .single();
    if (error) return err(toAppError(error, 'Split', split.id));
    return rowToSplit(data);
  }

  async updateSplit(split: Split): Promise<Result<Split, AppError>> {
    const { data, error } = await supabase
      .from('splits')
      .update({
        amount_paid_cents: split.amountPaidCents,
        settled_at:        split.settledAt?.toISOString() ?? null,
      })
      .eq('id', split.id)
      .select()
      .single();
    if (error) return err(toAppError(error, 'Split', split.id));
    return rowToSplit(data);
  }

  async deleteSplit(id: string): Promise<Result<void, AppError>> {
    const { error } = await supabase.from('splits').delete().eq('id', id);
    if (error) return err(toAppError(error, 'Split', id));
    return ok(undefined);
  }
}
