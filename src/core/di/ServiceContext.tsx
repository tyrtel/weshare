import React, { createContext, useContext, useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import Constants from 'expo-constants';
import { useStore } from 'zustand';
import { ServiceContainer } from './ServiceContainer';
import type { ServiceToken } from './ServiceContainer';
import { createProductionContainer } from './productionContainer';
import { createSimulationContainer } from './simulationContainer';
import type { ITripSessionStore } from '../interfaces/ITripSessionStore';
import { TRIP_STORE } from './tokens';

// ── Context ───────────────────────────────────────────────────────────────────
// Exported so test wrappers can inject a container directly via
// <ServiceContext.Provider value={createTestContainer()}>

export const ServiceContext = createContext<ServiceContainer | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

/**
 * Mount at the app root. Reads `Constants.expoConfig.extra.simulation` to
 * choose between production (Supabase) and simulation (in-memory mocks).
 */
export function ServiceProvider({ children }: { children: React.ReactNode }) {
  const [container, setContainer] = useState<ServiceContainer | null>(null);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    // Check both the Expo config extra field AND the raw env var so the flag
    // works whether the bundle was built with a config reload or not.
    const isSimulation =
      Constants.expoConfig?.extra?.simulation === true ||
      process.env.EXPO_PUBLIC_SIMULATE === 'true';

    console.log('[ServiceProvider] isSimulation =', isSimulation);
    console.log('[ServiceProvider] extra =', JSON.stringify(Constants.expoConfig?.extra));

    const factory = isSimulation ? createSimulationContainer : createProductionContainer;
    console.log('[ServiceProvider] calling factory:', factory.name);

    factory()
      .then(c => {
        console.log('[ServiceProvider] container ready');
        setContainer(c);
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[ServiceProvider] init error:', msg);
        setInitError(msg);
      });
  }, []);

  if (initError) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#1a1a2e' }}>
        <Text style={{ color: '#f87171', fontSize: 14, textAlign: 'center' }}>
          Failed to initialise app:{'\n\n'}{initError}
        </Text>
      </View>
    );
  }

  if (!container) {
    // Render a spinner rather than null — Expo Router SDK 51 keeps the native
    // splash screen visible until the Stack navigator mounts. Returning null
    // here prevents the Stack from ever mounting, so the splash never hides.
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1a1a2e' }}>
        <ActivityIndicator color="#1D9E75" size="large" />
      </View>
    );
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
