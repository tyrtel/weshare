import { useTripSessionStore } from '../core/di/ServiceContext';
import { computeSplitTotals } from './computations/splitTotals';
import type { SplitTotals } from './computations/splitTotals';

export type { SplitTotals };
export { computeSplitTotals };

export function useSplitTotals(personId: string, tripId: string): SplitTotals {
  const expenses = useTripSessionStore((s) => s.expenses[tripId] ?? []);
  const currency = useTripSessionStore(
    (s) => s.trips.find((t) => t.id === tripId)?.currency ?? 'USD',
  );
  return computeSplitTotals(personId, expenses, currency);
}
