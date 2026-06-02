import { useState, useCallback } from 'react';
import { useService } from '../../../core/di/ServiceContext';
import { EXPENSE_REPO, SPLIT_REPO, TRIP_STORE } from '../../../core/di/tokens';
import { isOk } from '../../../core/types/Result';
import { generateId } from '../../../core/utils/generateId';
import type { Expense } from '../../../core/models/Expense';
import type { AppError } from '../../../core/types/AppError';
import type { AddExpenseInput } from './useAddExpense';

export function useEditExpense() {
  const expenseRepo = useService(EXPENSE_REPO);
  const splitRepo   = useService(SPLIT_REPO);
  const storeApi    = useService(TRIP_STORE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  const editExpense = useCallback(
    async (existing: Expense, input: AddExpenseInput): Promise<Expense | null> => {
      setError(null);

      if (!input.description.trim()) {
        setError({ kind: 'ValidationError', field: 'description', message: 'Description is required.' });
        return null;
      }
      if (!Number.isInteger(input.totalAmountCents) || input.totalAmountCents <= 0) {
        setError({ kind: 'ValidationError', field: 'totalAmount', message: 'Amount must be a positive whole number of cents.' });
        return null;
      }

      setLoading(true);

      // Update the expense record.
      const updated: Expense = {
        ...existing,
        description:      input.description.trim(),
        totalAmountCents: input.totalAmountCents,
        currency:         input.currency,
        paidByUserId:     input.paidByUserId,
        metadata:         { ...existing.metadata, category: input.category },
      };

      const expResult = await expenseRepo.updateExpense(updated);
      if (!isOk(expResult)) {
        setError(expResult.error);
        setLoading(false);
        return null;
      }

      // Delete old splits, then save new ones.
      const oldSplits = await splitRepo.getSplitsForExpense(existing.id);
      if (isOk(oldSplits)) {
        await Promise.all(oldSplits.value.map(s => splitRepo.deleteSplit(s.id)));
      }

      const splitResults = await Promise.all(
        input.splits.map(s =>
          splitRepo.saveSplit({
            id: generateId(),
            expenseId: expResult.value.id,
            userId: s.userId,
            amountOwedCents: s.amountOwedCents,
            amountPaidCents: 0,
          }),
        ),
      );

      const firstError = splitResults.find(r => !isOk(r));
      if (firstError && !isOk(firstError)) {
        setError(firstError.error);
        setLoading(false);
        return null;
      }

      const savedExpense = { ...expResult.value, splits: splitResults.filter(isOk).map(r => r.value) };
      storeApi.getState().replaceExpense(savedExpense);
      setLoading(false);
      return savedExpense;
    },
    [expenseRepo, splitRepo, storeApi],
  );

  return { editExpense, loading, error };
}
