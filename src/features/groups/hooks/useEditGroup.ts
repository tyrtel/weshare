import { useState, useCallback } from 'react';
import { useService } from '../../../core/di/ServiceContext';
import { TRIP_STORE } from '../../../core/di/tokens';
import type { Group } from '../../../core/models/Group';
import type { AppError } from '../../../core/types/AppError';

/** Validates and applies a group edit save-first — see useEditExpense. */
export function useEditGroup() {
  const storeApi = useService(TRIP_STORE);
  const [error, setError] = useState<AppError | null>(null);

  const editGroup = useCallback(
    (group: Group, name: string, currency: string): Group | null => {
      setError(null);

      if (!name.trim()) {
        setError({ kind: 'ValidationError', field: 'name', message: 'Group name is required.' });
        return null;
      }

      const updated = { ...group, name: name.trim(), currency };
      void storeApi.getState().editGroup(group, updated);
      return updated;
    },
    [storeApi],
  );

  return { editGroup, error };
}
