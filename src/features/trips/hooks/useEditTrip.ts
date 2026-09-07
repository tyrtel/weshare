import { useState, useCallback } from 'react';
import { useService } from '../../../core/di/ServiceContext';
import { EXPENSE_REPO, TRIP_REPO, TRIP_STORE } from '../../../core/di/tokens';
import { isOk } from '../../../core/types/Result';
import type { Trip } from '../../../core/models/Trip';
import type { AppError } from '../../../core/types/AppError';

export function useEditTrip() {
  const tripRepo    = useService(TRIP_REPO);
  const expenseRepo = useService(EXPENSE_REPO);
  const storeApi    = useService(TRIP_STORE);
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
      try {
        const result = await tripRepo.updateTrip({ ...trip, name: name.trim(), currency });

        if (!isOk(result)) {
          setError(result.error);
          return null;
        }

        storeApi.getState().replaceTrip(result.value);

        if (currency !== trip.currency) {
          const expenses = storeApi.getState().expenses[trip.id] ?? [];
          await Promise.all(
            expenses
              .filter(e => e.currency === trip.currency)
              .map(async e => {
                const updated = { ...e, currency };
                const r = await expenseRepo.updateExpense(updated);
                if (isOk(r)) storeApi.getState().replaceExpense(r.value);
              }),
          );
        }

        return result.value;
      } catch (e) {
        // A thrown exception (a real network failure, distinct from a repo
        // returning Result.err) used to propagate uncaught — loading never
        // reset and the caller's post-save navigation never ran.
        setError({ kind: 'NetworkError', message: e instanceof Error ? e.message : 'Unexpected error' });
        return null;
      } finally {
        setLoading(false);
      }
    },
    [tripRepo, expenseRepo, storeApi],
  );

  return { editTrip, loading, error };
}
