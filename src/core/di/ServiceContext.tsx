import React, { createContext, useContext, useEffect, useState } from 'react';
import Constants from 'expo-constants';
import {
  ServiceContainer,
  ServiceKey,
  createProductionContainer,
  createTestContainer,
} from './container';

// ── Context ───────────────────────────────────────────────────────────────────

const ServiceContext = createContext<ServiceContainer | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

/**
 * Wrap the app root with this provider. It automatically selects production or
 * simulation bindings based on the `simulation` flag in `app.config.ts`.
 */
export function ServiceProvider({ children }: { children: React.ReactNode }) {
  const [container, setContainer] = useState<ServiceContainer | null>(null);

  useEffect(() => {
    const isSimulation = Constants.expoConfig?.extra?.simulation === true;

    if (isSimulation) {
      setContainer(createTestContainer());
    } else {
      createProductionContainer().then(setContainer);
    }
  }, []);

  if (!container) {
    // Container is not ready yet; return nothing rather than children with
    // unregistered services. A splash screen or skeleton would go here.
    return null;
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
 * Convenience hook: resolves a service by key from the nearest container.
 *
 * @example
 * const storage = useService('storageService');
 */
export function useService<K extends ServiceKey>(
  key: K,
): ReturnType<ServiceContainer['resolve']> {
  return useContainer().resolve(key);
}
