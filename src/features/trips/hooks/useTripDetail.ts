import { useState, useCallback, useEffect, useMemo } from 'react';
import { useService, useTripSessionStore } from '../../../core/di/ServiceContext';
import { TRIP_REPO, TRIP_STORE } from '../../../core/di/tokens';
import { selectExpenses } from '../../../store/selectors';
import { bucket } from '../../../core/logic/cacheFreshness';
import { useCacheRevalidation } from '../../../hooks/useCacheRevalidation';
import { isOk } from '../../../core/types/Result';
import type { Trip } from '../../../core/models/Trip';
import type { AppError } from '../../../core/types/AppError';

interface FetchedTrip {
  tripId: string;
  trip: Trip | null;
  error: AppError | null;
}

export function useTripDetail(tripId: string) {
  const tripRepo = useService(TRIP_REPO);
  const storeApi = useService(TRIP_STORE);

  // The trips list already holds this trip's row in the common case; only a
  // trip that isn't in the list (deep link, list not loaded yet) is fetched
  // individually — which is also how a deleted trip surfaces NotFoundError.
  const storeTrip = useTripSessionStore((s) => s.trips.find(t => t.id === tripId));
  const inStore   = storeTrip !== undefined;
  const [fetched, setFetched] = useState<FetchedTrip | null>(null);
  const current   = fetched?.tripId === tripId ? fetched : null;
  const baseTrip  = storeTrip ?? current?.trip ?? null;
  const error     = inStore ? null : current?.error ?? null;

  const rawExpenses  = useTripSessionStore((s) => selectExpenses(s, tripId));
  const expenses     = useMemo(
    () => [...rawExpenses].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    [rawExpenses],
  );
  // undefined means loadTripDetail hasn't run yet; after that it's always a TripMember[].
  const storeMembers = useTripSessionStore((s) => s.members[tripId]);

  // Merge the trip's embedded members (e.g. the owner, written at creation time
  // into the Trip row itself) with the store's reactive member list (populated by
  // loadTripDetail + appendMember).  storeMembers wins for any userId that appears
  // in both, so there are no duplicates.  This handles the case where the owner is
  // not yet in the member repository (simulation / fresh Supabase row) without
  // hiding participants that were added later.
  const tripWithMembers = useMemo(() => {
    if (!baseTrip) return null;
    if (storeMembers === undefined) return baseTrip;
    const storeUserIds = new Set(storeMembers.map(m => m.userId));
    const embeddedOnly = baseTrip.members.filter(m => !storeUserIds.has(m.userId));
    return { ...baseTrip, members: [...embeddedOnly, ...storeMembers] };
  }, [baseTrip, storeMembers]);

  const fetchTrip = useCallback(
    () => tripRepo.getTrip(tripId).then(result => setFetched(isOk(result)
      ? { tripId, trip: result.value, error: null }
      : { tripId, trip: null, error: result.error })),
    [tripId, tripRepo],
  );

  useEffect(() => {
    if (!inStore) void fetchTrip();
  }, [inStore, fetchTrip]);

  const { loading: detailLoading, refresh } = useCacheRevalidation([bucket.trip(tripId)]);

  const refetch = useCallback(
    () => Promise.all([
      refresh(),
      inStore ? storeApi.getState().revalidate('trips', { force: true }) : fetchTrip(),
    ]).then(() => {}),
    [refresh, inStore, storeApi, fetchTrip],
  );

  const loading = error ? false : !baseTrip || detailLoading;

  return { trip: tripWithMembers, expenses, loading, error, refetch };
}
