import { ok, err } from '../core/types/Result';
import type { Result } from '../core/types/Result';
import type { AppError } from '../core/types/AppError';
import type { IRecurringExpenseRepository } from '../core/interfaces/IRecurringExpenseRepository';
import type { RecurringExpense, RecurringExpenseSplit } from '../core/models/RecurringExpense';

type RecurringExpenseRow = Omit<RecurringExpense, 'splits'>;

export class InMemoryRecurringExpenseRepository implements IRecurringExpenseRepository {
  private readonly rows   = new Map<string, RecurringExpenseRow>();
  private readonly splits = new Map<string, RecurringExpenseSplit[]>(); // keyed by recurringExpenseId

  private compose(id: string): RecurringExpense | undefined {
    const row = this.rows.get(id);
    if (!row) return undefined;
    return { ...row, splits: this.splits.get(id) ?? [] };
  }

  seed(items: RecurringExpense[]): this {
    for (const { splits, ...row } of items) {
      this.rows.set(row.id, row);
      this.splits.set(row.id, [...splits]);
    }
    return this;
  }

  getRecurringExpensesForGroup = async (groupId: string): Promise<Result<RecurringExpense[], AppError>> => {
    const result: RecurringExpense[] = [];
    for (const id of this.rows.keys()) {
      const re = this.compose(id)!;
      if (re.groupId === groupId) result.push(re);
    }
    return ok(result);
  };

  saveRecurringExpense = async (re: RecurringExpense): Promise<Result<RecurringExpense, AppError>> => {
    const { splits, ...row } = re;
    this.rows.set(re.id, row);
    this.splits.set(re.id, [...splits]);
    return ok(this.compose(re.id)!);
  };

  updateRecurringExpense = async (re: RecurringExpense): Promise<Result<RecurringExpense, AppError>> => {
    if (!this.rows.has(re.id)) {
      return err({ kind: 'NotFoundError', resource: 'RecurringExpense', id: re.id });
    }
    const { splits, ...row } = re;
    this.rows.set(re.id, row);
    this.splits.set(re.id, [...splits]);
    return ok(this.compose(re.id)!);
  };

  deleteRecurringExpense = async (id: string): Promise<Result<void, AppError>> => {
    if (!this.rows.has(id)) {
      return err({ kind: 'NotFoundError', resource: 'RecurringExpense', id });
    }
    this.rows.delete(id);
    this.splits.delete(id);
    return ok(undefined);
  };

  pauseRecurringExpense = async (id: string): Promise<Result<RecurringExpense, AppError>> => {
    const re = this.compose(id);
    if (!re) return err({ kind: 'NotFoundError', resource: 'RecurringExpense', id });
    const updated = { ...re, pausedAt: new Date() };
    const { splits, ...row } = updated;
    this.rows.set(id, row);
    return ok(this.compose(id)!);
  };

  resumeRecurringExpense = async (id: string): Promise<Result<RecurringExpense, AppError>> => {
    const re = this.compose(id);
    if (!re) return err({ kind: 'NotFoundError', resource: 'RecurringExpense', id });
    const updated = { ...re, pausedAt: null };
    const { splits, ...row } = updated;
    this.rows.set(id, row);
    return ok(this.compose(id)!);
  };
}
