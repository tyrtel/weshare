import { useCallback, useMemo } from 'react';
import { useService, useTripSessionStore } from '../../../core/di/ServiceContext';
import { AUTH, TRIP_STORE } from '../../../core/di/tokens';
import { computeGroupBalances } from '../utils/computeGroupBalances';

export type GroupFinancialDirection = 'owe' | 'owed' | 'even' | 'no-data';

export interface GroupFinancialSummary {
  direction:   GroupFinancialDirection;
  amountCents: number;
  currency:    string;
}

export function useGroups() {
  const auth          = useService(AUTH);
  const storeApi      = useService(TRIP_STORE);
  const groups        = useTripSessionStore(s => s.groups);
  const trips         = useTripSessionStore(s => s.trips);
  const tripExpenses  = useTripSessionStore(s => s.expenses);
  const groupExpenses = useTripSessionStore(s => s.groupExpenses);
  const loading       = useTripSessionStore(s => !s.isHydrated);

  const user = auth.currentUser();

  const groupTripCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const trip of trips) {
      if (trip.groupId && trip.status !== 'closed') {
        counts[trip.groupId] = (counts[trip.groupId] ?? 0) + 1;
      }
    }
    return counts;
  }, [trips]);

  const groupSummaries = useMemo(() => {
    if (!user) return {} as Record<string, GroupFinancialSummary>;
    const result: Record<string, GroupFinancialSummary> = {};
    for (const group of groups) {
      const groupTrips = trips.filter(t => t.groupId === group.id);
      const currency   = group.currency;
      const { memberBalances } = computeGroupBalances(
        group.members.map(m => m.userId),
        groupTrips,
        tripExpenses as Record<string, import('../../../core/models/Expense').Expense[]>,
        groupExpenses[group.id] ?? [],
      );
      const myBalance = memberBalances.find(b => b.userId === user.id)?.balanceCents ?? 0;
      if (myBalance === 0 && memberBalances.every(b => b.balanceCents === 0)) {
        result[group.id] = { direction: 'no-data', amountCents: 0, currency };
      } else if (myBalance > 0) {
        result[group.id] = { direction: 'owed', amountCents: myBalance, currency };
      } else if (myBalance < 0) {
        result[group.id] = { direction: 'owe', amountCents: -myBalance, currency };
      } else {
        result[group.id] = { direction: 'even', amountCents: 0, currency };
      }
    }
    return result;
  }, [user, groups, trips, tripExpenses, groupExpenses]);

  const visibleGroups = user ? groups : [];

  const refetch = useCallback(async () => {
    if (!user) return;
    await storeApi.getState().loadGroups(user.id);
  }, [user, storeApi]);

  return { groups: visibleGroups, groupTripCounts, groupSummaries, loading, refetch };
}
