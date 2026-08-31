import { useCallback, useEffect, useMemo } from 'react';
import { useService, useTripSessionStore } from '../../../core/di/ServiceContext';
import { AUTH, TRIP_STORE } from '../../../core/di/tokens';
import { computeGroupBalances } from '../utils/computeGroupBalances';
import { computeCompletedGroupPayments } from '../utils/computeCompletedPayments';
import type { Expense } from '../../../core/models/Expense';

export type GroupFinancialDirection = 'owe' | 'owed' | 'settled' | 'partial' | 'no-activity';

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
  const groupSplitRequestsMap = useTripSessionStore(s => s.groupSplitRequests);
  const tripSplitRequests     = useTripSessionStore(s => s.splitRequests);
  const loading       = useTripSessionStore(s => !s.isHydrated);

  const user = auth.currentUser();

  // groupSummaries below needs each group's own standalone expenses
  // (groupExpenses[group.id]), but nothing else loads those in bulk — only
  // visiting that specific group's detail screen does (loadGroupDetail).
  // Without this, a group's balance pill only reflects its trips' expenses
  // until the user has opened it at least once this session.
  useEffect(() => {
    const missing = groups.filter(g => groupExpenses[g.id] === undefined);
    if (missing.length === 0) return;
    void Promise.all(missing.map(g => storeApi.getState().loadGroupDetail(g.id)));
  }, [groups, groupExpenses, storeApi]);

  // Same gap for completed payments: without these, a settled trip or a
  // group-level "settle everything" never nets against the balance pill
  // shown here, so a group could look permanently unsettled on the home
  // screen even after the user pays up (see useGroupDetail's equivalent).
  useEffect(() => {
    const missing = groups.filter(g => groupSplitRequestsMap[g.id] === undefined);
    if (missing.length === 0) return;
    void Promise.all(missing.map(g => storeApi.getState().loadSplitRequestsForGroup(g.id)));
  }, [groups, groupSplitRequestsMap, storeApi]);

  useEffect(() => {
    const groupTripIds = trips.filter(t => t.groupId).map(t => t.id);
    const missing = groupTripIds.filter(id => tripSplitRequests[id] === undefined);
    if (missing.length === 0) return;
    void Promise.all(missing.map(id => storeApi.getState().loadSplitRequests(id)));
  }, [trips, tripSplitRequests, storeApi]);

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
      const completedPayments = computeCompletedGroupPayments(
        groupSplitRequestsMap[group.id] ?? [],
        groupTrips,
        tripSplitRequests,
      );
      const { memberBalances } = computeGroupBalances(
        group.members.map(m => m.userId),
        groupTrips,
        tripExpenses as Record<string, Expense[]>,
        groupExpenses[group.id] ?? [],
        completedPayments,
      );
      const myBalance   = memberBalances.find(b => b.userId === user.id)?.balanceCents ?? 0;
      const allEven     = memberBalances.every(b => b.balanceCents === 0);
      const hasActivity = groupTrips.some(t => (tripExpenses[t.id]?.length ?? 0) > 0)
        || (groupExpenses[group.id]?.length ?? 0) > 0;

      if (myBalance > 0) {
        result[group.id] = { direction: 'owed', amountCents: myBalance, currency };
      } else if (myBalance < 0) {
        result[group.id] = { direction: 'owe', amountCents: -myBalance, currency };
      } else if (!hasActivity) {
        // Brand-new group, or one with expenses that net to nothing owed by
        // anyone (e.g. every expense paid and split evenly by the same
        // person) — distinct from an actually-resolved debt below.
        result[group.id] = { direction: 'no-activity', amountCents: 0, currency };
      } else if (allEven) {
        result[group.id] = { direction: 'settled', amountCents: 0, currency };
      } else {
        // You're squared away, but other members still owe each other —
        // not the same as the whole group being settled.
        result[group.id] = { direction: 'partial', amountCents: 0, currency };
      }
    }
    return result;
  }, [user, groups, trips, tripExpenses, groupExpenses, groupSplitRequestsMap, tripSplitRequests]);

  const visibleGroups = user ? groups : [];

  const refetch = useCallback(async () => {
    if (!user) return;
    await storeApi.getState().loadGroups(user.id);
  }, [user, storeApi]);

  return { groups: visibleGroups, groupTripCounts, groupSummaries, loading, refetch };
}
