import { useState, useCallback } from 'react';
import { useService } from '../../../core/di/ServiceContext';
import { TRIP_REPO, TRIP_STORE } from '../../../core/di/tokens';
import { isOk } from '../../../core/types/Result';
import type { AppError } from '../../../core/types/AppError';

export function useDeleteTrip() {
  const tripRepo = useService(TRIP_REPO);
  const storeApi  = useService(TRIP_STORE);

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<AppError | null>(null);

  const deleteTrip = useCallback(
    async (tripId: string): Promise<boolean> => {
      setError(null);
      setLoading(true);
      try {
        const result = await tripRepo.deleteTrip(tripId);
        if (!isOk(result)) { setError(result.error); return false; }
        storeApi.getState().removeTrip(tripId);
        return true;
      } catch (e) {
        setError({ kind: 'NetworkError', message: e instanceof Error ? e.message : 'Unexpected error' });
        return false;
      } finally {
        setLoading(false);
      }
    },
    [tripRepo, storeApi],
  );

  return { deleteTrip, loading, error };
}
