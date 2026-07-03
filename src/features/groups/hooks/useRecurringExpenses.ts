import { useState, useEffect } from 'react';
import { useService, useTripSessionStore } from '../../../core/di/ServiceContext';
import { RECURRING_EXPENSE_REPO, TRIP_STORE } from '../../../core/di/tokens';
import { isOk } from '../../../core/types/Result';
import type { AppError } from '../../../core/types/AppError';

export function useRecurringExpenses(groupId: string) {
  const repo     = useService(RECURRING_EXPENSE_REPO);
  const storeApi = useService(TRIP_STORE);
  const items    = useTripSessionStore(s => s.recurringExpenses[groupId]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<AppError | null>(null);

  useEffect(() => {
    if (storeApi.getState().recurringExpenses[groupId] !== undefined) return;
    setLoading(true);
    repo.getRecurringExpensesForGroup(groupId).then(result => {
      if (isOk(result)) {
        storeApi.getState().setRecurringExpensesForGroup(groupId, result.value);
      } else {
        setError(result.error);
      }
    }).finally(() => setLoading(false));
  }, [groupId, repo, storeApi]);

  return { recurringExpenses: items ?? [], loading, error };
}
