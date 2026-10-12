import { useMemo, useCallback } from 'react';
import { useService, useTripSessionStore } from '../../../core/di/ServiceContext';
import { TRIP_STORE } from '../../../core/di/tokens';
import { computeGroupBalances, type MemberBalance } from '../utils/computeGroupBalances';
import { computeArchivableItems } from '../utils/computeArchivableItems';
import { computeCompletedGroupPayments } from '../utils/computeCompletedPayments';
import type { LedgerPayment } from '../../../core/logic/settlement';
import { selectGroupSplitRequests } from '../../../store/selectors';
import { bucket } from '../../../core/logic/cacheFreshness';
import { useCacheRevalidation } from '../../../hooks/useCacheRevalidation';
import { createManualPaymentRequest } from '../../../core/models/SplitRequest';
import { isOk } from '../../../core/types/Result';
import type { Settlement } from '../../../core/models/Settlement';
import type { Expense } from '../../../core/models/Expense';
import type { Trip } from '../../../core/models/Trip';

export function useGroupDetail(groupId: string) {
  const storeApi      = useService(TRIP_STORE);
  const group         = useTripSessionStore(s => s.groups.find(g => g.id === groupId));
  const allTrips      = useTripSessionStore(s => s.trips);
  const rawExpenses   = useTripSessionStore(s => s.groupExpenses[groupId]);
  const tripExpenses  = useTripSessionStore(s => s.expenses);
  const groupSplitRequests = useTripSessionStore(s => selectGroupSplitRequests(s, groupId));
  const tripSplitRequests  = useTripSessionStore(s => s.splitRequests);

  const groupExpenses = useMemo(() => rawExpenses ?? [], [rawExpenses]);

  const groupTrips = useMemo(
    () => allTrips.filter(t => t.groupId === groupId),
    [allTrips, groupId],
  );

  const { loading } = useCacheRevalidation([bucket.group(groupId)]);
  // Ledger payments are trip-scoped or group-scoped, and a group's balance
  // spans both — keep each of its trips' split requests fresh too.
  const paymentBuckets = useMemo(
    () => [bucket.groupRequests(groupId), ...groupTrips.map(t => bucket.tripRequests(t.id))],
    [groupId, groupTrips],
  );
  useCacheRevalidation(paymentBuckets);

  // Closing a trip or an expense is purely organizational — it doesn't hide
  // debt or touch the ledger, just moves the item out of the main list into
  // a "past"/closed one, same idea as archiving rather than deleting.
  const activeTrips = useMemo(() => groupTrips.filter(t => t.status !== 'closed'), [groupTrips]);
  const closedTrips = useMemo(() => groupTrips.filter(t => t.status === 'closed'), [groupTrips]);
  const activeExpenses = useMemo(() => groupExpenses.filter(e => !e.settledAt), [groupExpenses]);
  const closedExpenses = useMemo(() => groupExpenses.filter(e => !!e.settledAt), [groupExpenses]);

  const completedPayments = useMemo<LedgerPayment[]>(
    () => computeCompletedGroupPayments(groupSplitRequests, groupTrips, tripSplitRequests),
    [groupSplitRequests, groupTrips, tripSplitRequests],
  );

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

  // Advisory only — surfaces expenses/trips whose debt is provably already
  // covered by payments made since, so the user can archive them manually.
  // Never used to hide debt or archive anything automatically.
  const { archivableExpenseIds, archivableTripIds } = useMemo(() => {
    if (!group) return { archivableExpenseIds: new Set<string>(), archivableTripIds: new Set<string>() };
    return computeArchivableItems(
      group.members.map(m => m.userId),
      groupTrips,
      tripExpenses as Record<string, Expense[]>,
      groupExpenses,
      completedPayments,
    );
  }, [group, groupTrips, tripExpenses, groupExpenses, completedPayments]);

  // The group-scoped counterpart of useSettlement's recordPayment — same
  // ledger write primitive, just with groupId set instead of tripId.
  const recordPayment = useCallback(
    (fromUserId: string, toUserId: string, amountCents: number, currency: string): void => {
      void storeApi.getState().saveSplitRequest(
        createManualPaymentRequest({ groupId, payerUserId: fromUserId, requesterUserId: toUserId, amountCents, currency }),
      );
    },
    [groupId, storeApi],
  );

  // Quick-action archiving triggered from the "ready to archive" icon —
  // same organizational close primitives as the expense/trip detail screens,
  // just callable directly from the group list without navigating away.
  // Save-first: the item moves immediately; the store undoes it on failure.
  const closeExpense = useCallback(
    (expense: Expense) => storeApi.getState().settleGroupExpense(expense.id, groupId, new Date()),
    [groupId, storeApi],
  );

  const closeTrip = useCallback(
    async (trip: Trip): Promise<boolean> => isOk(await storeApi.getState().setTripStatus(trip.id, 'closed')),
    [storeApi],
  );

  return {
    group,
    activeTrips,
    closedTrips,
    groupTrips,
    tripExpenses,
    groupExpenses,
    activeExpenses,
    closedExpenses,
    completedPayments,
    settlements,
    memberBalances,
    archivableExpenseIds,
    archivableTripIds,
    recordPayment,
    closeExpense,
    closeTrip,
    loading,
  };
}
