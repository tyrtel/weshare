import { useState, useEffect } from 'react';
import { useService, useTripSessionStore } from '../../../core/di/ServiceContext';
import { RECURRING_EXPENSE_REPO, TRIP_STORE } from '../../../core/di/tokens';
import { isOk } from '../../../core/types/Result';
import type { AppError } from '../../../core/types/AppError';

export function useRecurringExpenses(groupId: string) {
  const repo     = useService(RECURRING_EXPENSE_REPO);
  const storeApi = useService(TRIP_STORE);
  const items    = useTripSessionStore(s => s.recurringExpenses[groupId]);
  const [loading, setLoading] = useState(() => storeApi.getState().recurringExpenses[groupId] === undefined);
  const [error, setError]     = useState<AppError | null>(null);

  // groupId can change across renders (same hook instance, different group) —
  // flip loading back on synchronously during render rather than in the
  // effect below, matching the initial-mount case handled by the lazy
  // useState initializer above.
  const [prevGroupId, setPrevGroupId] = useState(groupId);
  if (groupId !== prevGroupId) {
    setPrevGroupId(groupId);
    if (storeApi.getState().recurringExpenses[groupId] === undefined) setLoading(true);
  }

  useEffect(() => {
    if (storeApi.getState().recurringExpenses[groupId] !== undefined) return;
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
