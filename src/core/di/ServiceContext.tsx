import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import Constants from 'expo-constants';
import { AppLoadingScreen } from '../../components/ui/AppLoadingScreen';
import { useStore } from 'zustand';
import { ServiceContainer } from './ServiceContainer';
import type { ServiceToken } from './ServiceContainer';
import { createProductionContainer } from './productionContainer';
import { createSimulationContainer } from './simulationContainer';
import type { ITripSessionStore } from '../interfaces/ITripSessionStore';
import { TRIP_STORE } from './tokens';
import { logger } from '../utils/logger';

// ── Context ───────────────────────────────────────────────────────────────────
// Exported so test wrappers can inject a container directly via
// <ServiceContext.Provider value={createTestContainer()}>

export const ServiceContext = createContext<ServiceContainer | null>(null);

// ── Shared container promise ──────────────────────────────────────────────────
// Expo Router renders the root layout twice during initialisation (concurrent
// rendering / hydration shell). Without this guard, ServiceProvider's useEffect
// fires twice, creating two SupabaseAuthService instances that race through
// getSession() and corrupt each other's auth state.
//
// The promise is stored on globalThis so it is shared even when Metro evaluates
// this module more than once (which can happen when the same file is required
// from two differently-resolved paths — a known Metro quirk). A module-level
// variable alone is not sufficient because each evaluation gets its own closure.
declare global {
  // eslint-disable-next-line no-var
  var __weShareContainerPromise: Promise<ServiceContainer> | undefined;
}

function acquireContainer(isSimulation: boolean): Promise<ServiceContainer> {
  if (!globalThis.__weShareContainerPromise) {
    const factory = isSimulation ? createSimulationContainer : createProductionContainer;
    logger.log('[ServiceProvider] calling factory:', factory.name);
    globalThis.__weShareContainerPromise = factory();
  } else {
    logger.log('[ServiceProvider] acquireContainer: cache hit — reusing existing container');
  }
  return globalThis.__weShareContainerPromise;
}

function resetContainerPromise() {
  globalThis.__weShareContainerPromise = undefined;
}

// ── Provider ──────────────────────────────────────────────────────────────────

/**
 * Mount at the app root. Reads `Constants.expoConfig.extra.simulation` to
 * choose between production (Supabase) and simulation (in-memory mocks).
 */
export function ServiceProvider({ children }: { children: React.ReactNode }) {
  const [container, setContainer] = useState<ServiceContainer | null>(null);
  const [initError, setInitError] = useState<string | null>(null);

  const init = useCallback((retry = false) => {
    if (retry) resetContainerPromise();
    setInitError(null);
    setContainer(null);

    const isSimulation =
      Constants.expoConfig?.extra?.simulation === true ||
      process.env.EXPO_PUBLIC_SIMULATE === 'true';

    logger.log('[ServiceProvider] isSimulation =', isSimulation);
    logger.log('[ServiceProvider] extra =', JSON.stringify(Constants.expoConfig?.extra));

    acquireContainer(isSimulation)
      .then(c => {
        logger.log('[ServiceProvider] container ready');
        setContainer(c);
      })
      .catch((e: unknown) => {
        resetContainerPromise();
        const msg = e instanceof Error ? e.message : String(e);
        logger.error('[ServiceProvider] init error:', msg);
        setInitError(msg);
      });
  }, []);

  useEffect(() => { init(); }, [init]);

  if (initError) {
    return (
      <AppLoadingScreen
        error="Something went wrong starting the app."
        onRetry={() => init(true)}
      />
    );
  }

  if (!container) {
    // Render AppLoadingScreen rather than null — Expo Router SDK 51 keeps the
    // native splash visible until the Stack navigator mounts. Returning null
    // prevents the Stack from ever mounting so the splash never hides.
    return <AppLoadingScreen />;
  }

  return (
    <ServiceContext.Provider value={container}>
      {children}
    </ServiceContext.Provider>
  );
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function useContainer(): ServiceContainer {
  const container = useContext(ServiceContext);
  if (!container) {
    throw new Error('useContainer must be called inside a <ServiceProvider>.');
  }
  return container;
}

/**
 * Convenience hook: resolves a typed service from the nearest container.
 *
 * @example
 * const storage = useService(STORAGE);   // typed as IStorageService
 * const auth    = useService(AUTH);      // typed as IAuthService
 */
export function useService<T>(token: ServiceToken<T>): T {
  return useContainer().resolve(token);
}

/**
 * Subscribe to the Zustand trip session store from any component.
 * The store is a singleton per DI container — shared across all screens.
 *
 * @example
 * const { trips, loadTrips, isHydrated } = useTripSessionStore();
 *
 * @example (selector — avoids re-renders when unrelated state changes)
 * const trips = useTripSessionStore(s => s.trips);
 */
export function useTripSessionStore(): ITripSessionStore;
export function useTripSessionStore<T>(selector: (state: ITripSessionStore) => T): T;
export function useTripSessionStore<T>(
  selector?: (state: ITripSessionStore) => T,
): ITripSessionStore | T {
  const store = useService(TRIP_STORE);
  // useStore with no selector returns the full state snapshot.
  return useStore(store, selector as (state: ITripSessionStore) => T);
}
