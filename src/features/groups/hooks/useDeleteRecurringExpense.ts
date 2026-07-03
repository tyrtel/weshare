import { useState, useCallback } from 'react';
import { useService } from '../../../core/di/ServiceContext';
import { RECURRING_EXPENSE_REPO, TRIP_STORE } from '../../../core/di/tokens';
import { isOk } from '../../../core/types/Result';
import type { AppError } from '../../../core/types/AppError';

export function useDeleteRecurringExpense() {
  const repo     = useService(RECURRING_EXPENSE_REPO);
  const storeApi = useService(TRIP_STORE);

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<AppError | null>(null);

  const deleteRecurringExpense = useCallback(
    async (id: string): Promise<boolean> => {
      setError(null);
      setLoading(true);
      try {
        const result = await repo.deleteRecurringExpense(id);
        if (!isOk(result)) { setError(result.error); return false; }
        storeApi.getState().removeRecurringExpense(id);
        return true;
      } catch (e) {
        setError({ kind: 'NetworkError', message: e instanceof Error ? e.message : 'Unexpected error' });
        return false;
      } finally {
        setLoading(false);
      }
    },
    [repo, storeApi],
  );

  return { deleteRecurringExpense, loading, error };
}
