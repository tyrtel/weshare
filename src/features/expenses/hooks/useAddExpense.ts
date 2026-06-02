import { useState, useCallback } from 'react';
import { useService } from '../../../core/di/ServiceContext';
import { EXPENSE_REPO, SPLIT_REPO, TRIP_STORE } from '../../../core/di/tokens';
import { isOk } from '../../../core/types/Result';
import { generateId } from '../../../core/utils/generateId';
import type { Expense } from '../../../core/models/Expense';
import type { AppError } from '../../../core/types/AppError';

export interface SplitInput {
  userId: string;
  amountOwedCents: number;
}

export interface AddExpenseInput {
  description: string;
  totalAmountCents: number;
  currency: string;
  paidByUserId: string;
  splits: SplitInput[];
  category?: string;
  receiptUrl?: string;
}

// ── Pure helpers (exported for use in screen/components) ──────────────────────

/**
 * Divide totalCents as evenly as possible among userIds.
 * The last person absorbs the rounding remainder so the sum is always exact.
 */
export function equalSplit(totalCents: number, userIds: string[]): SplitInput[] {
  const n = userIds.length;
  if (n === 0) return [];
  const base = Math.floor(totalCents / n);
  const remainder = totalCents - base * n;
  return userIds.map((userId, i) => ({
    userId,
    amountOwedCents: i === n - 1 ? base + remainder : base,
  }));
}

function validate(input: AddExpenseInput): AppError | null {
  if (!input.description.trim()) {
    return { kind: 'ValidationError', field: 'description', message: 'Description is required.' };
  }
  if (!Number.isInteger(input.totalAmountCents) || input.totalAmountCents <= 0) {
    return {
      kind: 'ValidationError',
      field: 'totalAmount',
      message: 'Amount must be a positive whole number of cents.',
    };
  }
  if (!input.paidByUserId) {
    return { kind: 'ValidationError', field: 'paidByUserId', message: 'Payer is required.' };
  }
  if (input.splits.length === 0) {
    return {
      kind: 'ValidationError',
      field: 'splits',
      message: 'At least one person must share the expense.',
    };
  }
  const splitTotal = input.splits.reduce((sum, s) => sum + s.amountOwedCents, 0);
  if (splitTotal !== input.totalAmountCents) {
    return {
      kind: 'ValidationError',
      field: 'splits',
      message: `Split total (${splitTotal}¢) must equal expense total (${input.totalAmountCents}¢).`,
    };
  }
  return null;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAddExpense(tripId: string) {
  const expenseRepo = useService(EXPENSE_REPO);
  const splitRepo   = useService(SPLIT_REPO);
  const storeApi    = useService(TRIP_STORE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  const addExpense = useCallback(
    async (input: AddExpenseInput): Promise<Expense | null> => {
      setError(null);

      const validationError = validate(input);
      if (validationError) {
        setError(validationError);
        return null;
      }

      setLoading(true);

      const expense: Expense = {
        id: generateId(),
        tripId,
        description: input.description.trim(),
        totalAmountCents: input.totalAmountCents,
        currency: input.currency,
        paidByUserId: input.paidByUserId,
        createdAt: new Date(),
        splits: [],
        metadata: { category: input.category, receiptUrl: input.receiptUrl },
      };

      const expResult = await expenseRepo.saveExpense(expense);
      if (!isOk(expResult)) {
        setError(expResult.error);
        setLoading(false);
        return null;
      }

      // Save all splits in parallel.
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

      const firstSplitError = splitResults.find(r => !isOk(r));
      if (firstSplitError && !isOk(firstSplitError)) {
        setError(firstSplitError.error);
        setLoading(false);
        return null;
      }

      const savedExpense = {
        ...expResult.value,
        splits: splitResults.filter(isOk).map(r => r.value),
      };
      storeApi.getState().appendExpense(savedExpense);
      setLoading(false);
      return savedExpense;
    },
    [expenseRepo, splitRepo, storeApi, tripId],
  );

  return { addExpense, loading, error };
}
