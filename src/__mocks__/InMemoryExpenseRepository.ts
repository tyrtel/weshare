import { ok, err } from '../core/types/Result';
import type { Result } from '../core/types/Result';
import type { AppError } from '../core/types/AppError';
import type { IExpenseRepository } from '../core/interfaces/IExpenseRepository';
import type { Expense } from '../core/models/Expense';
import type { Split } from '../core/models/Split';

export class InMemoryExpenseRepository implements IExpenseRepository {
  private readonly expenses = new Map<string, Expense>();
  // Shared splits index used for hydration — can be shared with InMemorySplitRepository
  // so that splitRepo.updateSplit() is visible to getExpensesForTrip().
  private readonly splits: Map<string, Split>;

  constructor(splitsDb?: Map<string, Split>) {
    this.splits = splitsDb ?? new Map<string, Split>();
  }

  seed(expenses: Expense[], splits?: Split[]): this {
    expenses.forEach(e => this.expenses.set(e.id, e));
    splits?.forEach(s => this.splits.set(s.id, s));
    return this;
  }

  private _hydrateSplits(expense: Expense): Expense {
    const splits: Split[] = [];
    for (const split of this.splits.values()) {
      if (split.expenseId === expense.id) splits.push(split);
    }
    return { ...expense, splits: splits.length > 0 ? splits : expense.splits };
  }

  getExpense = async (id: string): Promise<Result<Expense, AppError>> => {
    const expense = this.expenses.get(id);
    if (!expense) return err({ kind: 'NotFoundError', resource: 'Expense', id });
    return ok(this._hydrateSplits(expense));
  };

  getExpensesForTrip = async (tripId: string): Promise<Result<Expense[], AppError>> => {
    const result: Expense[] = [];
    for (const expense of this.expenses.values()) {
      if (expense.tripId === tripId) result.push(this._hydrateSplits(expense));
    }
    return ok(result);
  };

  saveExpense = async (expense: Expense): Promise<Result<Expense, AppError>> => {
    this.expenses.set(expense.id, expense);
    return ok(expense);
  };

  updateExpense = async (expense: Expense): Promise<Result<Expense, AppError>> => {
    if (!this.expenses.has(expense.id)) {
      return err({ kind: 'NotFoundError', resource: 'Expense', id: expense.id });
    }
    this.expenses.set(expense.id, expense);
    return ok(expense);
  };

  deleteExpense = async (id: string): Promise<Result<void, AppError>> => {
    if (!this.expenses.has(id)) {
      return err({ kind: 'NotFoundError', resource: 'Expense', id });
    }
    this.expenses.delete(id);
    return ok(undefined);
  };
}
