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
      try {
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
        };

        const expResult = await expenseRepo.updateExpense(updated);
        if (!isOk(expResult)) {
          setError(expResult.error);
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
              expenseId: existing.id,
              userId: s.userId,
              amountOwedCents: s.amountOwedCents,
              amountPaidCents: 0,
            }),
          ),
        );

        const firstError = splitResults.find(r => !isOk(r));
        if (firstError && !isOk(firstError)) {
          setError(firstError.error);
          return null;
        }

        // Use `updated` (not the server response) as the store base so the new
        // paidByUserId and metadata are reflected immediately, regardless of what
        // the DB echoes back.
        const savedExpense = { ...updated, splits: splitResults.filter(isOk).map(r => r.value) };
        storeApi.getState().replaceExpense(savedExpense);
        return savedExpense;
      } catch (e) {
        // See useAddExpense's identical guard: an uncaught throw here (a real
        // network failure, not an API error the repo already maps to
        // Result.err) used to leave loading stuck true and never navigate
        // the screen away.
        setError({ kind: 'NetworkError', message: e instanceof Error ? e.message : 'Unexpected error' });
        return null;
      } finally {
        setLoading(false);
      }
    },
    [expenseRepo, splitRepo, storeApi],
  );

  return { editExpense, loading, error };
}
