import type { Result } from '../types/Result';
import type { AppError } from '../types/AppError';
import type { Expense } from '../models/Expense';

export interface IExpenseRepository {
  getExpense(id: string): Promise<Result<Expense, AppError>>;
  getExpensesForTrip(tripId: string): Promise<Result<Expense[], AppError>>;
  saveExpense(expense: Expense): Promise<Result<Expense, AppError>>;
  updateExpense(expense: Expense): Promise<Result<Expense, AppError>>;
  deleteExpense(id: string): Promise<Result<void, AppError>>;
}
