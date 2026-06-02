import type { Result } from '../types/Result';
import type { AppError } from '../types/AppError';
import type { Split } from '../models/Split';

export interface ISplitRepository {
  getSplit(id: string): Promise<Result<Split, AppError>>;
  getSplitsForExpense(expenseId: string): Promise<Result<Split[], AppError>>;
  saveSplit(split: Split): Promise<Result<Split, AppError>>;
  updateSplit(split: Split): Promise<Result<Split, AppError>>;
  deleteSplit(id: string): Promise<Result<void, AppError>>;
}
