import { useState, useCallback } from 'react';
import { useService } from '../../../core/di/ServiceContext';
import { EXPENSE_REPO, TRIP_STORE } from '../../../core/di/tokens';
import { isOk } from '../../../core/types/Result';
import type { AppError } from '../../../core/types/AppError';

export function useSettleGroupExpense() {
  const expenseRepo = useService(EXPENSE_REPO);
  const storeApi    = useService(TRIP_STORE);

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<AppError | null>(null);

  const settleGroupExpense = useCallback(
    async (expenseId: string, groupId: string): Promise<boolean> => {
      setError(null);
      setLoading(true);
      try {
        const settledAt = new Date();
        const result    = await expenseRepo.settleExpense(expenseId, settledAt);
        if (!isOk(result)) { setError(result.error); return false; }
        storeApi.getState().settleGroupExpenseInStore(expenseId, groupId, settledAt);
        return true;
      } catch (e) {
        setError({ kind: 'NetworkError', message: e instanceof Error ? e.message : 'Unexpected error' });
        return false;
      } finally {
        setLoading(false);
      }
    },
    [expenseRepo, storeApi],
  );

  return { settleGroupExpense, loading, error };
}
