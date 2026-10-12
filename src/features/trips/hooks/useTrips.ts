import { useCallback, useEffect, useMemo } from 'react';
import { useService, useTripSessionStore } from '../../../core/di/ServiceContext';
import { AUTH, TRIP_STORE } from '../../../core/di/tokens';
import { deriveTripFinancialSummary } from '../../../core/logic/settlement';
import { bucket } from '../../../core/logic/cacheFreshness';
import { useCacheRevalidation } from '../../../hooks/useCacheRevalidation';
import type { Trip } from '../../../core/models/Trip';
import type { TripFinancialSummary } from '../../../core/logic/settlement';

const TRIPS_BUCKET = ['trips'] as const;

export function useTrips() {
  const storeApi = useService(TRIP_STORE);
  const auth     = useService(AUTH);

  const trips          = useTripSessionStore((s) => s.trips);
  const allExpenses    = useTripSessionStore((s) => s.expenses);
  const hydrationError = useTripSessionStore((s) => s.hydrationError);
  const tripsMissing   = useTripSessionStore((s) => s.fetchedAt.trips === undefined);

  const user = auth.currentUser();
  const visibleTrips: Trip[] = useMemo(
    () => (user ? trips.filter(t => t.status !== 'closed') : []),
    [user, trips],
  );

  const { loading, refresh } = useCacheRevalidation(TRIPS_BUCKET);
  // Card summaries need each trip's expenses; these refresh in the background
  // and never block the list.
  const { refresh: refreshDetails } = useCacheRevalidation(visibleTrips.map(t => bucket.trip(t.id)));

  // A different user signing in must not be served the previous user's list.
  useEffect(() => {
    let prevUserId = auth.currentUser()?.id ?? null;
    return auth.onAuthStateChange((newUser) => {
      const newId = newUser?.id ?? null;
      if (newId === prevUserId) return;
      prevUserId = newId;
      if (newId) void storeApi.getState().revalidate('trips', { force: true });
    });
  }, [auth, storeApi]);

  const refetch = useCallback(
    () => Promise.all([refresh(), refreshDetails()]).then(() => {}),
    [refresh, refreshDetails],
  );

  const summaries = useMemo<Record<string, TripFinancialSummary | null>>(() => {
    if (!user) return {};
    return Object.fromEntries(
      visibleTrips.map(t => [
        t.id,
        deriveTripFinancialSummary(t.members, allExpenses[t.id] ?? [], user.id),
      ]),
    );
  }, [visibleTrips, allExpenses, user]);

  return {
    trips: visibleTrips,
    summaries,
    loading: user ? loading : false,
    error: user && tripsMissing ? hydrationError : null,
    refetch,
  };
}
