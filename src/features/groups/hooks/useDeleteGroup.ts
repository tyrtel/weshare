import { useState, useCallback } from 'react';
import { useService } from '../../../core/di/ServiceContext';
import { GROUP_REPO, TRIP_STORE } from '../../../core/di/tokens';
import { isOk } from '../../../core/types/Result';
import type { AppError } from '../../../core/types/AppError';

export function useDeleteGroup() {
  const groupRepo = useService(GROUP_REPO);
  const storeApi  = useService(TRIP_STORE);

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<AppError | null>(null);

  const deleteGroup = useCallback(
    async (groupId: string): Promise<boolean> => {
      setError(null);
      setLoading(true);
      try {
        const result = await groupRepo.deleteGroup(groupId);
        if (!isOk(result)) { setError(result.error); return false; }
        storeApi.getState().removeGroup(groupId);
        return true;
      } catch (e) {
        setError({ kind: 'NetworkError', message: e instanceof Error ? e.message : 'Unexpected error' });
        return false;
      } finally {
        setLoading(false);
      }
    },
    [groupRepo, storeApi],
  );

  return { deleteGroup, loading, error };
}
