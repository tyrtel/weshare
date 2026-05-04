import { useTripSessionStore } from '../core/di/ServiceContext';
import { computePeopleWithTotals } from './computations/peopleWithTotals';
import type { MemberWithTotal } from './computations/peopleWithTotals';

export type { MemberWithTotal };
export { computePeopleWithTotals };

export function usePeopleWithTotals(tripId: string): MemberWithTotal[] {
  const members = useTripSessionStore((s) => s.members[tripId] ?? []);
  const expenses = useTripSessionStore((s) => s.expenses[tripId] ?? []);
  const currency = useTripSessionStore(
    (s) => s.trips.find((t) => t.id === tripId)?.currency ?? 'USD',
  );
  return computePeopleWithTotals(members, expenses, currency);
}
