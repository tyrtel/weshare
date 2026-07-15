import { useCallback, useMemo } from 'react';
import { useSettlement } from './useSettlement';
import { buildLedgerHistory } from '../../../core/logic/settlement';
import type { LedgerPayment } from '../../../core/logic/settlement';

/**
 * Builds the chronological, running-balance ledger for exactly one pair —
 * every expense either paid the other, and every completed payment either
 * made, in either direction. Reuses `useSettlement` rather than re-loading
 * the trip itself, since it already holds everything this needs (expenses,
 * split requests, and the `recordPayment` write primitive).
 */
export function useLedgerHistory(tripId: string, fromUserId: string, toUserId: string) {
  const {
    expenses,
    splitRequests,
    loading,
    error,
    settling,
    recordPayment: recordPaymentForTrip,
    refetch,
  } = useSettlement(tripId);

  const payments = useMemo<LedgerPayment[]>(
    () => splitRequests
      .filter(r => r.status === 'paid' || r.status === 'completed')
      .filter(r =>
        (r.payerUserId === fromUserId && r.requesterUserId === toUserId) ||
        (r.payerUserId === toUserId && r.requesterUserId === fromUserId),
      )
      .map(r => ({
        payerUserId: r.payerUserId,
        payeeUserId: r.requesterUserId,
        amountCents: r.amountCents,
        currency:    r.currency,
        id:          r.id,
        date:        r.updatedAt,
      })),
    [splitRequests, fromUserId, toUserId],
  );

  const entries = useMemo(
    () => buildLedgerHistory(fromUserId, toUserId, expenses, payments),
    [fromUserId, toUserId, expenses, payments],
  );

  // All expenses in a trip share one currency (see settlement.ts) — a safe fallback
  // for a pair with no entries yet (recording the very first payment between them).
  const currency = entries[entries.length - 1]?.currency ?? expenses[0]?.currency ?? 'EUR';

  const recordPayment = useCallback(
    (amountCents: number) => recordPaymentForTrip(fromUserId, toUserId, amountCents, currency),
    [recordPaymentForTrip, fromUserId, toUserId, currency],
  );

  const balanceCents = entries[entries.length - 1]?.balanceCents ?? 0;

  return { entries, balanceCents, currency, loading, error, settling, recordPayment, refetch };
}
