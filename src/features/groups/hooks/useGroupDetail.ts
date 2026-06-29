import { useState, useEffect, useMemo } from 'react';
import { useService, useTripSessionStore } from '../../../core/di/ServiceContext';
import { TRIP_STORE } from '../../../core/di/tokens';
import { computeGroupBalances, type MemberBalance } from '../utils/computeGroupBalances';
import type { Settlement } from '../../../core/models/Settlement';
import type { Expense } from '../../../core/models/Expense';

export function useGroupDetail(groupId: string) {
  const storeApi      = useService(TRIP_STORE);
  const group         = useTripSessionStore(s => s.groups.find(g => g.id === groupId));
  const allTrips      = useTripSessionStore(s => s.trips);
  const rawExpenses   = useTripSessionStore(s => s.groupExpenses[groupId]);
  const tripExpenses  = useTripSessionStore(s => s.expenses);
  const [expensesLoading, setExpensesLoading] = useState(false);

  useEffect(() => {
    if (storeApi.getState().groupExpenses[groupId] !== undefined) return;
    setExpensesLoading(true);
    storeApi.getState().loadGroupDetail(groupId).finally(() => setExpensesLoading(false));
  }, [groupId, storeApi]);

  const groupExpenses = rawExpenses ?? [];

  const groupTrips = useMemo(
    () => allTrips.filter(t => t.groupId === groupId),
    [allTrips, groupId],
  );

  const activeTrips          = useMemo(() => groupTrips.filter(t => t.status !== 'closed'), [groupTrips]);
  const closedTrips          = useMemo(() => groupTrips.filter(t => t.status === 'closed'), [groupTrips]);
  const activeGroupExpenses  = useMemo(() => groupExpenses.filter(e => !e.settledAt), [groupExpenses]);
  const settledGroupExpenses = useMemo(() => groupExpenses.filter(e => !!e.settledAt), [groupExpenses]);

  const { settlements, memberBalances } = useMemo<{ settlements: Settlement[]; memberBalances: MemberBalance[] }>(() => {
    if (!group) return { settlements: [], memberBalances: [] };
    return computeGroupBalances(
      group.members.map(m => m.userId),
      groupTrips,
      tripExpenses as Record<string, Expense[]>,
      groupExpenses,
    );
  }, [group, groupTrips, tripExpenses, groupExpenses]);

  return {
    group,
    activeTrips,
    closedTrips,
    activeGroupExpenses,
    settledGroupExpenses,
    settlements,
    memberBalances,
    loading: expensesLoading,
  };
}
