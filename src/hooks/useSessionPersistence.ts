import { useTripSessionStore } from '../core/di/ServiceContext';
import type { AppError } from '../core/types/AppError';

export interface SessionPersistence {
  /**
   * False until the first loadTrips call resolves (success or error).
   * Equivalent to Zustand persist's onRehydrateStorage callback — driven by
   * the first IStorageService round-trip rather than local storage rehydration.
   * Gate screen renders on this flag to avoid showing stale empty state.
   */
  isHydrated: boolean;
  /**
   * Set if loadTrips resolved with a storage error or Zod validation failure.
   * Null on success.
   */
  hydrationError: AppError | null;
  /** Clears all cached trip/expense state and resets isHydrated to false. */
  resetSession: () => void;
}

/**
 * Surfaces the Zustand store's hydration state for any component that needs
 * to gate its render until the initial data load has completed.
 *
 * Usage in a screen root:
 *   const { isHydrated, hydrationError } = useSessionPersistence();
 *   return <ScreenWrapper isLoading={!isHydrated}>...</ScreenWrapper>;
 */
export function useSessionPersistence(): SessionPersistence {
  const isHydrated = useTripSessionStore((s) => s.isHydrated);
  const hydrationError = useTripSessionStore((s) => s.hydrationError);
  const resetSession = useTripSessionStore((s) => s.resetSession);
  return { isHydrated, hydrationError, resetSession };
}
