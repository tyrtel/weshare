import { useState, useCallback } from 'react';
import { useService } from '../../../core/di/ServiceContext';
import { GROUP_REPO, TRIP_STORE } from '../../../core/di/tokens';
import { isOk } from '../../../core/types/Result';
import type { Group } from '../../../core/models/Group';
import type { AppError } from '../../../core/types/AppError';

export function useEditGroup() {
  const groupRepo = useService(GROUP_REPO);
  const storeApi  = useService(TRIP_STORE);

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
        return result.value;
      } catch (e) {
        setError({ kind: 'NetworkError', message: e instanceof Error ? e.message : 'Unexpected error' });
        return null;
      } finally {
        setLoading(false);
      }
    },
    [groupRepo, storeApi],
  );

  return { editGroup, loading, error };
}
