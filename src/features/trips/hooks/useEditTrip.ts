import { useState, useCallback } from 'react';
import { useService } from '../../../core/di/ServiceContext';
import { TRIP_STORE } from '../../../core/di/tokens';
import type { Trip } from '../../../core/models/Trip';
import type { AppError } from '../../../core/types/AppError';

/** Validates and applies a trip edit save-first — see useEditExpense. */
export function useEditTrip() {
  const storeApi = useService(TRIP_STORE);
  const [error, setError] = useState<AppError | null>(null);

  const editTrip = useCallback(
    (trip: Trip, name: string, currency: string): Trip | null => {
      setError(null);

      if (!name.trim()) {
        setError({ kind: 'ValidationError', field: 'name', message: 'Trip name is required.' });
        return null;
      }

      const updated = { ...trip, name: name.trim(), currency };
      void storeApi.getState().editTrip(trip, updated);
      return updated;
    },
    [storeApi],
  );

  return { editTrip, error };
}
