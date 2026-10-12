import { useState, useCallback } from 'react';
import { useService } from '../../../core/di/ServiceContext';
import { TRIP_STORE } from '../../../core/di/tokens';
import { generateId } from '../../../core/utils/generateId';
import type { Expense } from '../../../core/models/Expense';
import type { AppError } from '../../../core/types/AppError';
import type { AddExpenseInput } from './useAddExpense';

/**
 * Validates and applies an edit save-first: the cache updates immediately and
 * the edited expense is returned so the form can close; the store persists it
 * in the background and undoes it (surfacing writeError) if the server refuses.
 */
export function useEditExpense() {
  const storeApi = useService(TRIP_STORE);
  const [error, setError] = useState<AppError | null>(null);

  const editExpense = useCallback(
    (existing: Expense, input: AddExpenseInput): Expense | null => {
      setError(null);

      if (!input.description.trim()) {
        setError({ kind: 'ValidationError', field: 'description', message: 'Description is required.' });
        return null;
      }
      if (!Number.isInteger(input.totalAmountCents) || input.totalAmountCents <= 0) {
        setError({ kind: 'ValidationError', field: 'totalAmount', message: 'Amount must be a positive whole number of cents.' });
        return null;
      }

      const updated: Expense = {
        ...existing,
        description:      input.description.trim(),
        totalAmountCents: input.totalAmountCents,
        currency:         input.currency,
        paidByUserId:     input.paidByUserId,
        metadata: {
          category:       input.category,
          receiptUrl:     input.receiptUrl,
          lineItems:      input.lineItems,
          originalAmount: input.originalAmount,
        },
        splits: input.splits.map(s => ({
          id:              generateId(),
          expenseId:       existing.id,
          userId:          s.userId,
          amountOwedCents: s.amountOwedCents,
          amountPaidCents: 0,
        })),
      };

      void storeApi.getState().editExpense(existing, updated);
      return updated;
    },
    [storeApi],
  );

  return { editExpense, error };
}
