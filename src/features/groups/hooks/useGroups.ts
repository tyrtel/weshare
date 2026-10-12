import { useCallback, useMemo } from 'react';
import { useService, useTripSessionStore } from '../../../core/di/ServiceContext';
import { AUTH } from '../../../core/di/tokens';
import { bucket } from '../../../core/logic/cacheFreshness';
import { useCacheRevalidation } from '../../../hooks/useCacheRevalidation';
import { computeGroupBalances } from '../utils/computeGroupBalances';
import { computeCompletedGroupPayments } from '../utils/computeCompletedPayments';
import type { Expense } from '../../../core/models/Expense';

export type GroupFinancialDirection = 'owe' | 'owed' | 'settled' | 'partial' | 'no-activity';

export interface GroupFinancialSummary {
  direction:   GroupFinancialDirection;
  amountCents: number;
  currency:    string;
}

const GROUPS_BUCKET = ['groups'] as const;

export function useGroups() {
  const auth          = useService(AUTH);
  const groups        = useTripSessionStore(s => s.groups);
  const trips         = useTripSessionStore(s => s.trips);
  const tripExpenses  = useTripSessionStore(s => s.expenses);
  const groupExpenses = useTripSessionStore(s => s.groupExpenses);
  const groupSplitRequestsMap = useTripSessionStore(s => s.groupSplitRequests);
  const tripSplitRequests     = useTripSessionStore(s => s.splitRequests);

  const user = auth.currentUser();

  // groupSummaries below needs each group's standalone expenses and its
  // completed payments (group- and trip-scoped) — without them a group's
  // balance pill only reflects its trips' expenses, and a group could look
  // permanently unsettled after the user pays up. These refresh in the
  // background and never block the list.
  const { loading, refresh } = useCacheRevalidation(GROUPS_BUCKET);
  const detailBuckets = useMemo(() => [
    ...groups.flatMap(g => [bucket.group(g.id), bucket.groupRequests(g.id)]),
    ...trips.filter(t => t.groupId).map(t => bucket.tripRequests(t.id)),
  ], [groups, trips]);
  const { refresh: refreshDetails } = useCacheRevalidation(detailBuckets);

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

  const refetch = useCallback(
    () => Promise.all([refresh(), refreshDetails()]).then(() => {}),
    [refresh, refreshDetails],
  );

  return { groups: visibleGroups, groupTripCounts, groupSummaries, loading: user ? loading : false, refetch };
}
