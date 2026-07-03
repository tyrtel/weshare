import type { Result } from '../types/Result';
import type { AppError } from '../types/AppError';
import type { RecurringExpense } from '../models/RecurringExpense';

export interface IRecurringExpenseRepository {
  getRecurringExpensesForGroup(groupId: string): Promise<Result<RecurringExpense[], AppError>>;
  saveRecurringExpense(re: RecurringExpense): Promise<Result<RecurringExpense, AppError>>;
  updateRecurringExpense(re: RecurringExpense): Promise<Result<RecurringExpense, AppError>>;
  deleteRecurringExpense(id: string): Promise<Result<void, AppError>>;
  pauseRecurringExpense(id: string): Promise<Result<RecurringExpense, AppError>>;
  resumeRecurringExpense(id: string): Promise<Result<RecurringExpense, AppError>>;
}
