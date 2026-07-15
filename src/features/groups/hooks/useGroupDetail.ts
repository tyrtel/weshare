import { useState, useEffect, useMemo } from 'react';
import { useService, useTripSessionStore } from '../../../core/di/ServiceContext';
import { TRIP_STORE } from '../../../core/di/tokens';
import { computeGroupBalances, type MemberBalance } from '../utils/computeGroupBalances';
import type { LedgerPayment } from '../../../core/logic/settlement';
import { selectGroupSplitRequests } from '../../../store/selectors';
import type { Settlement } from '../../../core/models/Settlement';
import type { Expense } from '../../../core/models/Expense';
import type { SplitRequest } from '../../../core/models/SplitRequest';

export function useGroupDetail(groupId: string) {
  const storeApi      = useService(TRIP_STORE);
  const group         = useTripSessionStore(s => s.groups.find(g => g.id === groupId));
  const allTrips      = useTripSessionStore(s => s.trips);
  const rawExpenses   = useTripSessionStore(s => s.groupExpenses[groupId]);
  const tripExpenses  = useTripSessionStore(s => s.expenses);
  const groupSplitRequests = useTripSessionStore(s => selectGroupSplitRequests(s, groupId));
  const tripSplitRequests  = useTripSessionStore(s => s.splitRequests);
  const [expensesLoading, setExpensesLoading] = useState(false);

  useEffect(() => {
    if (storeApi.getState().groupExpenses[groupId] !== undefined) return;
    setExpensesLoading(true);
    storeApi.getState().loadGroupDetail(groupId).finally(() => setExpensesLoading(false));
  }, [groupId, storeApi]);

  useEffect(() => { void storeApi.getState().loadSplitRequestsForGroup(groupId); }, [groupId, storeApi]);

  const groupExpenses = rawExpenses ?? [];

  const groupTrips = useMemo(
    () => allTrips.filter(t => t.groupId === groupId),
    [allTrips, groupId],
  );

  // Ledger payments are trip-scoped or group-scoped, and a group's balance
  // spans both — load each of its trips' split requests too.
  useEffect(() => {
    for (const trip of groupTrips) void storeApi.getState().loadSplitRequests(trip.id);
  }, [groupTrips, storeApi]);

  // Phase 4c: closing a trip is purely organizational now (see closedTrips
  // below) — it doesn't hide debt. Settling an expense is retired entirely;
  // group expenses are no longer split into active/settled buckets.
  const activeTrips = useMemo(() => groupTrips.filter(t => t.status !== 'closed'), [groupTrips]);
  const closedTrips = useMemo(() => groupTrips.filter(t => t.status === 'closed'), [groupTrips]);

  const completedPayments = useMemo<LedgerPayment[]>(() => {
    const allRequests: SplitRequest[] = [
      ...groupSplitRequests,
      ...groupTrips.flatMap(t => tripSplitRequests[t.id] ?? []),
    ];
    return allRequests
      .filter(r => r.status === 'paid' || r.status === 'completed')
      .map(r => ({
        payerUserId: r.payerUserId,
        payeeUserId: r.requesterUserId,
        amountCents: r.amountCents,
        currency:    r.currency,
      }));
  }, [groupSplitRequests, groupTrips, tripSplitRequests]);

  const { settlements, memberBalances } = useMemo<{ settlements: Settlement[]; memberBalances: MemberBalance[] }>(() => {
    if (!group) return { settlements: [], memberBalances: [] };
    return computeGroupBalances(
      group.members.map(m => m.userId),
      groupTrips,
      tripExpenses as Record<string, Expense[]>,
      groupExpenses,
      completedPayments,
    );
  }, [group, groupTrips, tripExpenses, groupExpenses, completedPayments]);

  return {
    group,
    activeTrips,
    closedTrips,
    tripExpenses,
    groupExpenses,
    settlements,
    memberBalances,
    loading: expensesLoading,
  };
}
