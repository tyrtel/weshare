import { useState, useCallback } from 'react';
import { useService } from '../../../core/di/ServiceContext';
import { TRIP_REPO, TRIP_STORE } from '../../../core/di/tokens';
import { isOk } from '../../../core/types/Result';
import type { Result } from '../../../core/types/Result';
import type { Trip } from '../../../core/models/Trip';
import type { AppError } from '../../../core/types/AppError';

// Owner actions on a trip's invite link: change its lifetime, or reset it.
export function useTripInviteLink(tripId: string) {
  const tripRepo = useService(TRIP_REPO);
  const storeApi = useService(TRIP_STORE);

  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  const apply = useCallback(async (action: () => Promise<Result<Trip, AppError>>): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      if (!isOk(result)) {
        setError(result.error);
        return false;
      }
      storeApi.getState().replaceTrip(result.value);
      return true;
    } catch (e) {
      setError({ kind: 'NetworkError', message: e instanceof Error ? e.message : 'Unexpected error' });
      return false;
    } finally {
      setBusy(false);
    }
  }, [storeApi]);

  const setTtl = useCallback(
    (ttlHours: number | null) => apply(() => tripRepo.setInviteTtl(tripId, ttlHours)),
    [apply, tripRepo, tripId],
  );
  const reset = useCallback(() => apply(() => tripRepo.resetInvite(tripId)), [apply, tripRepo, tripId]);

  return { setTtl, reset, busy, error };
}
