import { useState, useEffect, useMemo, useCallback } from 'react';
import { useService, useTripSessionStore } from '../../../core/di/ServiceContext';
import { TRIP_STORE, EXPENSE_REPO } from '../../../core/di/tokens';
import { computeGroupBalances, type MemberBalance } from '../utils/computeGroupBalances';
import { computeArchivableItems } from '../utils/computeArchivableItems';
import { computeCompletedGroupPayments } from '../utils/computeCompletedPayments';
import type { LedgerPayment } from '../../../core/logic/settlement';
import { selectGroupSplitRequests } from '../../../store/selectors';
import { createManualPaymentRequest } from '../../../core/models/SplitRequest';
import { isOk } from '../../../core/types/Result';
import type { Settlement } from '../../../core/models/Settlement';
import type { Expense } from '../../../core/models/Expense';
import type { Trip } from '../../../core/models/Trip';

export function useGroupDetail(groupId: string) {
  const storeApi      = useService(TRIP_STORE);
  const expenseRepo   = useService(EXPENSE_REPO);
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

  const groupExpenses = useMemo(() => rawExpenses ?? [], [rawExpenses]);

  const groupTrips = useMemo(
    () => allTrips.filter(t => t.groupId === groupId),
    [allTrips, groupId],
  );

  // Ledger payments are trip-scoped or group-scoped, and a group's balance
  // spans both — load each of its trips' split requests too.
  useEffect(() => {
    for (const trip of groupTrips) void storeApi.getState().loadSplitRequests(trip.id);
  }, [groupTrips, storeApi]);

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
  const [recording, setRecording] = useState(false);

  const recordPayment = useCallback(
    async (fromUserId: string, toUserId: string, amountCents: number, currency: string): Promise<void> => {
      setRecording(true);
      try {
        await storeApi.getState().saveSplitRequest(
          createManualPaymentRequest({ groupId, payerUserId: fromUserId, requesterUserId: toUserId, amountCents, currency }),
        );
      } finally {
        setRecording(false);
      }
    },
    [groupId, storeApi],
  );

  // Quick-action archiving triggered from the "ready to archive" icon —
  // same organizational close primitives as the expense/trip detail screens,
  // just callable directly from the group list without navigating away.
  const [closing, setClosing] = useState(false);

  const closeExpense = useCallback(
    async (expense: Expense): Promise<boolean> => {
      setClosing(true);
      try {
        const settledAt = new Date();
        const result = await expenseRepo.settleExpense(expense.id, settledAt);
        if (!isOk(result)) return false;
        storeApi.getState().settleGroupExpenseInStore(expense.id, groupId, settledAt);
        return true;
      } finally {
        setClosing(false);
      }
    },
    [expenseRepo, groupId, storeApi],
  );

  const closeTrip = useCallback(
    async (trip: Trip): Promise<boolean> => {
      setClosing(true);
      try {
        const result = await storeApi.getState().setTripStatus(trip.id, 'closed');
        return isOk(result);
      } finally {
        setClosing(false);
      }
    },
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
    recording,
    closeExpense,
    closeTrip,
    closing,
    loading: expensesLoading,
  };
}
