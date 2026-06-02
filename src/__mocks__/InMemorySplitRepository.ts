import { ok, err } from '../core/types/Result';
import type { Result } from '../core/types/Result';
import type { AppError } from '../core/types/AppError';
import type { ISplitRepository } from '../core/interfaces/ISplitRepository';
import type { Split } from '../core/models/Split';

export class InMemorySplitRepository implements ISplitRepository {
  // Exposed so InMemoryExpenseRepository can share the same Map reference.
  readonly splits: Map<string, Split>;

  constructor(splitsDb?: Map<string, Split>) {
    this.splits = splitsDb ?? new Map<string, Split>();
  }

  seed(splits: Split[]): this {
    splits.forEach(s => this.splits.set(s.id, s));
    return this;
  }

  getSplit = async (id: string): Promise<Result<Split, AppError>> => {
    const split = this.splits.get(id);
    if (!split) return err({ kind: 'NotFoundError', resource: 'Split', id });
    return ok(split);
  };

  getSplitsForExpense = async (expenseId: string): Promise<Result<Split[], AppError>> => {
    const result: Split[] = [];
    for (const split of this.splits.values()) {
      if (split.expenseId === expenseId) result.push(split);
    }
    return ok(result);
  };

  saveSplit = async (split: Split): Promise<Result<Split, AppError>> => {
    this.splits.set(split.id, split);
    return ok(split);
  };

  updateSplit = async (split: Split): Promise<Result<Split, AppError>> => {
    if (!this.splits.has(split.id)) {
      return err({ kind: 'NotFoundError', resource: 'Split', id: split.id });
    }
    this.splits.set(split.id, split);
    return ok(split);
  };

  deleteSplit = async (id: string): Promise<Result<void, AppError>> => {
    if (!this.splits.has(id)) {
      return err({ kind: 'NotFoundError', resource: 'Split', id });
    }
    this.splits.delete(id);
    return ok(undefined);
  };
}
