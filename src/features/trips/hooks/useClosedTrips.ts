import { useCallback, useMemo } from 'react';
import { useService, useTripSessionStore } from '../../../core/di/ServiceContext';
import { AUTH } from '../../../core/di/tokens';
import { bucket } from '../../../core/logic/cacheFreshness';
import { useCacheRevalidation } from '../../../hooks/useCacheRevalidation';
import type { Trip } from '../../../core/models/Trip';

const TRIPS_BUCKET = ['trips'] as const;

export function useClosedTrips() {
  const auth = useService(AUTH);

  const trips          = useTripSessionStore((s) => s.trips);
  const hydrationError = useTripSessionStore((s) => s.hydrationError);
  const tripsMissing   = useTripSessionStore((s) => s.fetchedAt.trips === undefined);

  const user = auth.currentUser();
  const closedTrips: Trip[] = useMemo(() => {
    if (!user) return [];
    return trips
      .filter(t => t.status === 'closed')
      .sort((a, b) => (b.closedAt?.getTime() ?? 0) - (a.closedAt?.getTime() ?? 0));
  }, [trips, user]);

  const { loading, refresh } = useCacheRevalidation(TRIPS_BUCKET);
  const { refresh: refreshDetails } = useCacheRevalidation(closedTrips.map(t => bucket.trip(t.id)));

  const refetch = useCallback(
    () => Promise.all([refresh(), refreshDetails()]).then(() => {}),
    [refresh, refreshDetails],
  );

  return {
    trips: closedTrips,
    loading: user ? loading : false,
    error: user && tripsMissing ? hydrationError : null,
    refetch,
  };
}
