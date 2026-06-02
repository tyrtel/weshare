import { useTripSessionStore } from '../core/di/ServiceContext';
import { selectExpenses, selectMembers } from '../store/selectors';
import { computePeopleWithTotals } from './computations/peopleWithTotals';
import type { MemberWithTotal } from './computations/peopleWithTotals';

export type { MemberWithTotal };
export { computePeopleWithTotals };

export function usePeopleWithTotals(tripId: string): MemberWithTotal[] {
  const members  = useTripSessionStore((s) => selectMembers(s, tripId));
  const expenses = useTripSessionStore((s) => selectExpenses(s, tripId));
  const currency = useTripSessionStore(
    (s) => s.trips.find((t) => t.id === tripId)?.currency ?? 'USD',
  );
  return computePeopleWithTotals(members, expenses, currency);
}
