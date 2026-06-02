import { useState, useCallback } from 'react';
import { useService } from '../../../core/di/ServiceContext';
import { TRIP_REPO, TRIP_STORE } from '../../../core/di/tokens';
import { isOk } from '../../../core/types/Result';
import type { Trip } from '../../../core/models/Trip';
import type { AppError } from '../../../core/types/AppError';

export function useEditTrip() {
  const tripRepo = useService(TRIP_REPO);
  const storeApi = useService(TRIP_STORE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  const editTrip = useCallback(
    async (trip: Trip, name: string, currency: string): Promise<Trip | null> => {
      setError(null);

      if (!name.trim()) {
        setError({ kind: 'ValidationError', field: 'name', message: 'Trip name is required.' });
        return null;
      }

      setLoading(true);
      const result = await tripRepo.updateTrip({ ...trip, name: name.trim(), currency });
      setLoading(false);

      if (!isOk(result)) {
        setError(result.error);
        return null;
      }

      storeApi.getState().replaceTrip(result.value);
      return result.value;
    },
    [tripRepo, storeApi],
  );

  return { editTrip, loading, error };
}
