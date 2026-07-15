import { useCallback, useMemo } from 'react';
import { useGroupDetail } from './useGroupDetail';
import { buildLedgerHistory } from '../../../core/logic/settlement';
import type { Expense } from '../../../core/models/Expense';

/**
 * Group-scoped counterpart of settlement/hooks/useLedgerHistory — builds the
 * chronological, running-balance ledger for one pair, spanning both the
 * group's own direct expenses and every one of its trips' expenses (the same
 * "spans both scopes" merge useGroupDetail already does for the balance
 * calculation). Reuses useGroupDetail rather than re-loading the group a
 * second way, same reasoning as the trip-side hook reusing useSettlement.
 */
export function useGroupLedgerHistory(groupId: string, fromUserId: string, toUserId: string) {
  const {
    groupTrips,
    tripExpenses,
    groupExpenses,
    completedPayments,
    recordPayment: recordPaymentForGroup,
    recording,
    loading,
  } = useGroupDetail(groupId);

  const allExpenses = useMemo<Expense[]>(
    () => [...groupTrips.flatMap(t => tripExpenses[t.id] ?? []), ...groupExpenses],
    [groupTrips, tripExpenses, groupExpenses],
  );

  const entries = useMemo(
    () => buildLedgerHistory(fromUserId, toUserId, allExpenses, completedPayments),
    [fromUserId, toUserId, allExpenses, completedPayments],
  );

  // All expenses in a group share one currency (see settlement.ts) — a safe
  // fallback for a pair with no entries yet (recording their first payment).
  const currency = entries[entries.length - 1]?.currency ?? allExpenses[0]?.currency ?? 'EUR';

  const recordPayment = useCallback(
    (amountCents: number) => recordPaymentForGroup(fromUserId, toUserId, amountCents, currency),
    [recordPaymentForGroup, fromUserId, toUserId, currency],
  );

  const balanceCents = entries[entries.length - 1]?.balanceCents ?? 0;

  return { entries, balanceCents, currency, loading, error: null, settling: recording, recordPayment };
}
