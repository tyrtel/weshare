import { useState, useRef, useCallback, useMemo } from 'react';
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

  // If AuthGate's startup sequence already loaded trips, skip the initial
  // loading state and the first DB fetch — show data immediately on mount.
  const [state, setState] = useState<UseTripsState>(() => ({
    loading: !storeApi.getState().isHydrated,
    error:   storeApi.getState().hydrationError,
  }));
  const skipInitialLoad = useRef(storeApi.getState().isHydrated);

  const trips       = useTripSessionStore((s) => s.trips);
  const allExpenses = useTripSessionStore((s) => s.expenses);

  const load = useCallback(async () => {
    // Set loading immediately so the UI shows a spinner on every call, even
    // when trips are already in the store (e.g. return from background).
    setState(prev => ({ ...prev, loading: true, error: null }));
    Sentry.addBreadcrumb({ category: 'trips', message: 'load_start', level: 'info' });
    // 5 s buffer over getInitialUser's 20 s session-restore timeout.
    // If auth still isn't ready by then, treat as signed-out; AuthGate redirects.
    try {
      await withTimeout(auth.awaitReady(), 25_000);
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

    Sentry.addBreadcrumb({ category: 'trips', message: 'load_calling_db', level: 'info' });
    try {
      await withTimeout(storeApi.getState().loadTrips(user.id), 15_000);
    } catch {
      // On Supabase free tier, the first authenticated query after a cold
      // PostgREST start takes 10–20 s to establish the PostgreSQL connection.
      // The abandoned request warms the server-side connection, so an immediate
      // retry almost always succeeds in < 2 s. Only surface an error if the
      // retry also fails — that indicates a genuine outage, not cold-start lag.
      Sentry.captureMessage('trips_load_timeout_retrying', 'warning');
      Sentry.addBreadcrumb({ category: 'trips', message: 'load_cold_start_retry', level: 'warning' });
      try {
        await withTimeout(storeApi.getState().loadTrips(user.id), 20_000);
      } catch {
        Sentry.captureMessage('trips_load_timeout', 'warning');
        setState({ loading: false, error: { kind: 'NetworkError', message: 'Loading trips timed out — pull down to retry' } });
        return;
      }
    }
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
      try {
        await withTimeout(storeApi.getState().loadTrips(user.id), 15_000);
      } catch {
        Sentry.captureMessage('trips_retry_timeout', 'warning');
        setState({ loading: false, error: { kind: 'NetworkError', message: 'Loading trips timed out — pull down to retry' } });
        return;
      }
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
      // Skip the first DB fetch if AuthGate's startup sequence already loaded
      // trips — avoids a redundant round-trip and a skeleton flash on launch.
      // The ref resets to false after the first focus so subsequent focuses
      // (return from trip detail, app foreground) reload normally.
      if (!skipInitialLoad.current) {
        load();
      }
      skipInitialLoad.current = false;

      // Track the user ID at focus time so TOKEN_REFRESHED events (same user,
      // new token) don't trigger an unnecessary trip reload and cause a stutter.
      let prevUserId = auth.currentUser()?.id ?? null;
      const unsubscribe = auth.onAuthStateChange((newUser) => {
        const newId = newUser?.id ?? null;
        if (newId === prevUserId) return;
        prevUserId = newId;
        Sentry.addBreadcrumb({ category: 'trips', message: 'auth_change_triggering_reload', level: 'info' });
        load();
      });
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
