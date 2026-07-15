import { useState, useCallback } from 'react';
import { useService } from '../../../core/di/ServiceContext';
import { GROUP_REPO, EXPENSE_REPO, TRIP_STORE } from '../../../core/di/tokens';
import { isOk } from '../../../core/types/Result';
import type { Group } from '../../../core/models/Group';
import type { AppError } from '../../../core/types/AppError';

export function useEditGroup() {
  const groupRepo   = useService(GROUP_REPO);
  const expenseRepo = useService(EXPENSE_REPO);
  const storeApi    = useService(TRIP_STORE);

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<AppError | null>(null);

  const editGroup = useCallback(
    async (group: Group, name: string, currency: string): Promise<Group | null> => {
      setError(null);
      setLoading(true);
      try {
        if (!name.trim()) {
          setError({ kind: 'ValidationError', field: 'name', message: 'Group name is required.' });
          return null;
        }
        const updated = { ...group, name: name.trim(), currency };
        const result  = await groupRepo.updateGroup(updated);
        if (!isOk(result)) { setError(result.error); return null; }
        storeApi.getState().updateGroupInStore(result.value);

        if (currency !== group.currency) {
          const groupExpenses = storeApi.getState().groupExpenses[group.id] ?? [];
          await Promise.all(
            groupExpenses
              .filter(e => e.currency === group.currency)
              .map(async e => {
                const updatedExpense = { ...e, currency };
                const r = await expenseRepo.updateExpense(updatedExpense);
                if (isOk(r)) storeApi.getState().replaceGroupExpense(r.value);
              }),
          );
        }

        return result.value;
      } catch (e) {
        setError({ kind: 'NetworkError', message: e instanceof Error ? e.message : 'Unexpected error' });
        return null;
      } finally {
        setLoading(false);
      }
    },
    [groupRepo, expenseRepo, storeApi],
  );

  return { editGroup, loading, error };
}
