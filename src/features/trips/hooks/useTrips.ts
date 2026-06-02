import { useState, useCallback, useMemo } from 'react';
import { useFocusEffect } from 'expo-router';
import { useService, useTripSessionStore } from '../../../core/di/ServiceContext';
import { AUTH, TRIP_STORE } from '../../../core/di/tokens';
import { deriveTripFinancialSummary } from '../../../core/logic/settlement';
import type { Trip } from '../../../core/models/Trip';
import type { AppError } from '../../../core/types/AppError';
import type { TripFinancialSummary } from '../../../core/logic/settlement';

interface UseTripsState {
  loading: boolean;
  error: AppError | null;
}

export function useTrips() {
  const storeApi = useService(TRIP_STORE);
  const auth     = useService(AUTH);

  const [state, setState] = useState<UseTripsState>({ loading: true, error: null });

  const trips       = useTripSessionStore((s) => s.trips);
  const allExpenses = useTripSessionStore((s) => s.expenses);

  const load = useCallback(async () => {
    const user = auth.currentUser();
    if (!user) {
      setState({ loading: false, error: null });
      return;
    }
    setState((prev) => ({ ...prev, loading: true, error: null }));
    await storeApi.getState().loadTrips(user.id);
    // Eagerly hydrate detail for every trip so BalanceSummaryScreen has expenses.
    const loadedTrips = storeApi.getState().trips;
    if (loadedTrips.length > 0) {
      await Promise.all(loadedTrips.map((t) => storeApi.getState().loadTripDetail(t.id)));
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
  const visibleTrips: Trip[] = user ? trips.filter(t => t.status !== 'closed') : [];

  const summaries = useMemo<Record<string, TripFinancialSummary | null>>(() => {
    if (!user) return {};
    return Object.fromEntries(
      visibleTrips.map(t => [
        t.id,
        deriveTripFinancialSummary(t.members, allExpenses[t.id] ?? [], user.id),
      ]),
    );
  }, [visibleTrips, allExpenses, user]);

  return { trips: visibleTrips, summaries, loading: state.loading, error: state.error, refetch: load };
}
