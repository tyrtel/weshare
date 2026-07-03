import { useState, useCallback } from 'react';
import { useService } from '../../../core/di/ServiceContext';
import { RECURRING_EXPENSE_REPO, TRIP_STORE } from '../../../core/di/tokens';
import { isOk } from '../../../core/types/Result';
import type { RecurringExpense } from '../../../core/models/RecurringExpense';
import type { AppError } from '../../../core/types/AppError';

export function usePauseRecurringExpense() {
  const repo     = useService(RECURRING_EXPENSE_REPO);
  const storeApi = useService(TRIP_STORE);

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<AppError | null>(null);

  const pause = useCallback(
    async (id: string): Promise<RecurringExpense | null> => {
      setError(null);
      setLoading(true);
      try {
        const result = await repo.pauseRecurringExpense(id);
        if (!isOk(result)) { setError(result.error); return null; }
        storeApi.getState().updateRecurringExpenseInStore(result.value);
        return result.value;
      } catch (e) {
        setError({ kind: 'NetworkError', message: e instanceof Error ? e.message : 'Unexpected error' });
        return null;
      } finally {
        setLoading(false);
      }
    },
    [repo, storeApi],
  );

  const resume = useCallback(
    async (id: string): Promise<RecurringExpense | null> => {
      setError(null);
      setLoading(true);
      try {
        const result = await repo.resumeRecurringExpense(id);
        if (!isOk(result)) { setError(result.error); return null; }
        storeApi.getState().updateRecurringExpenseInStore(result.value);
        return result.value;
      } catch (e) {
        setError({ kind: 'NetworkError', message: e instanceof Error ? e.message : 'Unexpected error' });
        return null;
      } finally {
        setLoading(false);
      }
    },
    [repo, storeApi],
  );

  return { pause, resume, loading, error };
}
