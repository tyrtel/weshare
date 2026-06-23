import { useState, useCallback, useMemo } from 'react';
import { useFocusEffect } from 'expo-router';
import * as Sentry from '@sentry/react-native';
import { useService, useTripSessionStore } from '../../../core/di/ServiceContext';
import { AUTH, TRIP_STORE } from '../../../core/di/tokens';
import { deriveTripFinancialSummary } from '../../../core/logic/settlement';
import type { Trip } from '../../../core/models/Trip';
import type { AppError } from '../../../core/types/AppError';
import type { TripFinancialSummary } from '../../../core/logic/settlement';

const RETRY_DELAY_MS = 1500;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      const t = setTimeout(() => reject(new Error(`Request timed out after ${ms / 1000}s`)), ms);
      // Prevent this timer from keeping the Jest worker (or Node process) alive
      // if the main promise resolves first and the timeout never fires.
      if (typeof t === 'object' && t !== null) t.unref();
    }),
  ]);
}

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
    Sentry.addBreadcrumb({ category: 'trips', message: 'load_start', level: 'info' });
    // Wait longer than getInitialUser's own 10s getSession timeout so we never
    // race it. If auth still isn't ready, treat as signed-out; AuthGate redirects.
    try {
      await withTimeout(auth.awaitReady(), 65_000);
    } catch {
      Sentry.addBreadcrumb({ category: 'trips', message: 'load_auth_not_ready', level: 'warning' });
      setState({ loading: false, error: null });
      return;
    }

    const user = auth.currentUser();
    if (!user) {
      Sentry.addBreadcrumb({ category: 'trips', message: 'load_no_user', level: 'warning' });
      setState({ loading: false, error: null });
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    Sentry.addBreadcrumb({ category: 'trips', message: 'load_calling_db', level: 'info' });
    await storeApi.getState().loadTrips(user.id);
    const loadedTrips = storeApi.getState().trips;
    Sentry.addBreadcrumb({
      category: 'trips',
      message:  `load_db_returned: count=${loadedTrips.length} err=${!!storeApi.getState().hydrationError}`,
      level:    storeApi.getState().hydrationError ? 'warning' : 'info',
    });
    if (loadedTrips.length > 0) {
      await Promise.all(loadedTrips.map((t) => storeApi.getState().loadTripDetail(t.id)));
    }

    // On transient network/Supabase errors, retry once silently before
    // surfacing anything to the user.
    if (storeApi.getState().hydrationError) {
      const errDetail = JSON.stringify(storeApi.getState().hydrationError);
      Sentry.captureMessage(`trips_hydration_error: ${errDetail}`, 'warning');
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      Sentry.addBreadcrumb({ category: 'trips', message: 'load_retry', level: 'info' });
      await storeApi.getState().loadTrips(user.id);
      const retryTrips = storeApi.getState().trips;
      Sentry.addBreadcrumb({
        category: 'trips',
        message:  `load_retry_returned: count=${retryTrips.length} err=${!!storeApi.getState().hydrationError}`,
        level:    storeApi.getState().hydrationError ? 'warning' : 'info',
      });
      if (retryTrips.length > 0) {
        await Promise.all(retryTrips.map((t) => storeApi.getState().loadTripDetail(t.id)));
      }
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
