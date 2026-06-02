import { useState, useCallback, useMemo } from 'react';
import { useFocusEffect } from 'expo-router';
import { useService, useTripSessionStore } from '../../../core/di/ServiceContext';
import { TRIP_REPO, TRIP_STORE } from '../../../core/di/tokens';
import { selectExpenses } from '../../../store/selectors';
import { isOk } from '../../../core/types/Result';
import type { Trip } from '../../../core/models/Trip';
import type { AppError } from '../../../core/types/AppError';

interface UseTripDetailState {
  trip: Trip | null;
  loading: boolean;
  error: AppError | null;
}

export function useTripDetail(tripId: string) {
  const tripRepo = useService(TRIP_REPO);
  const storeApi = useService(TRIP_STORE);

  const [state, setState] = useState<UseTripDetailState>({
    trip: null,
    loading: true,
    error: null,
  });

  // Reactive — updated by store whenever mutations go through the store.
  const expenses     = useTripSessionStore((s) => selectExpenses(s, tripId));
  // undefined means loadTripDetail hasn't run yet; after that it's always a TripMember[].
  const storeMembers = useTripSessionStore((s) => s.members[tripId]);

  // Merge the trip's embedded members (e.g. the owner, written at creation time
  // into the Trip row itself) with the store's reactive member list (populated by
  // loadTripDetail + appendMember).  storeMembers wins for any userId that appears
  // in both, so there are no duplicates.  This handles the case where the owner is
  // not yet in the member repository (simulation / fresh Supabase row) without
  // hiding participants that were added later.
  const tripWithMembers = useMemo(() => {
    if (!state.trip) return null;
    if (storeMembers === undefined) return state.trip;
    const storeUserIds = new Set(storeMembers.map(m => m.userId));
    const embeddedOnly = state.trip.members.filter(m => !storeUserIds.has(m.userId));
    return { ...state.trip, members: [...embeddedOnly, ...storeMembers] };
  }, [state.trip, storeMembers]);

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    const [tripResult] = await Promise.all([
      tripRepo.getTrip(tripId),
      storeApi.getState().loadTripDetail(tripId),
    ]);

    if (!isOk(tripResult)) {
      setState({ trip: null, loading: false, error: tripResult.error });
      return;
    }
    setState({ trip: tripResult.value, loading: false, error: null });
  }, [tripId, tripRepo, storeApi]);

  useFocusEffect(
    useCallback(() => { load(); }, [load]),
  );

  return { ...state, trip: tripWithMembers, expenses, refetch: load };
}
