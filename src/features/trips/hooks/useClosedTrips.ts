import { useState, useCallback, useMemo } from 'react';
import { useFocusEffect } from 'expo-router';
import { useService, useTripSessionStore } from '../../../core/di/ServiceContext';
import { AUTH, TRIP_STORE } from '../../../core/di/tokens';
import type { Trip } from '../../../core/models/Trip';
import type { AppError } from '../../../core/types/AppError';

export function useClosedTrips() {
  const storeApi = useService(TRIP_STORE);
  const auth     = useService(AUTH);

  const [state, setState] = useState<{ loading: boolean; error: AppError | null }>({ loading: true, error: null });

  const trips = useTripSessionStore((s) => s.trips);

  const load = useCallback(async () => {
    const user = auth.currentUser();
    if (!user) {
      setState({ loading: false, error: null });
      return;
    }
    setState((prev) => ({ ...prev, loading: true, error: null }));
    await storeApi.getState().loadTrips(user.id);
    const closedTrips = storeApi.getState().trips.filter(t => t.status === 'closed');
    if (closedTrips.length > 0) {
      await Promise.all(closedTrips.map(t => storeApi.getState().loadTripDetail(t.id)));
    }
    setState({ loading: false, error: storeApi.getState().hydrationError });
  }, [auth, storeApi]);

  useFocusEffect(
    useCallback(() => {
      load();
      const unsubscribe = auth.onAuthStateChange(() => { load(); });
      return unsubscribe;
    }, [load, auth]),
  );

  const user = auth.currentUser();
  const closedTrips: Trip[] = useMemo(() => {
    if (!user) return [];
    return trips
      .filter(t => t.status === 'closed')
      .sort((a, b) => (b.closedAt?.getTime() ?? 0) - (a.closedAt?.getTime() ?? 0));
  }, [trips, user]);

  return { trips: closedTrips, loading: state.loading, error: state.error, refetch: load };
}
