import { useState, useEffect, useCallback, useMemo } from 'react';
import { useService, useTripSessionStore } from '../../../core/di/ServiceContext';
import { TRIP_STORE, AUTH } from '../../../core/di/tokens';
import { calculateSettlements } from '../../../core/logic/settlement';
import type { LedgerPayment } from '../../../core/logic/settlement';
import { useStripePoller } from './useStripePoller';
import { selectExpenses, selectMembers, selectSplitRequests } from '../../../store/selectors';
import type { Settlement } from '../../../core/models/Settlement';
import { createManualPaymentRequest } from '../../../core/models/SplitRequest';
import type { SplitRequest, SplitRequestStatus } from '../../../core/models/SplitRequest';
import type { TripStatus } from '../../../core/models/Trip';
import type { TripMember } from '../../../core/models/TripMember';
import type { AppError } from '../../../core/types/AppError';

export interface EnrichedSettlement extends Settlement {
  fromDisplayName: string;
  toDisplayName: string;
  latestRequest: SplitRequest | null;
}

export function useSettlement(tripId: string) {
  const storeApi = useService(TRIP_STORE);
  const auth     = useService(AUTH);

  // Reactive slices from the store — updated whenever mutations go through store actions.
  const members       = useTripSessionStore((s) => selectMembers(s, tripId));
  const expenses      = useTripSessionStore((s) => selectExpenses(s, tripId));
  const splitRequests = useTripSessionStore((s) => selectSplitRequests(s, tripId));

  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<AppError | null>(null);
  const [settling, setSettling] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    await Promise.all([
      storeApi.getState().loadTripDetail(tripId),
      storeApi.getState().loadSplitRequests(tripId),
    ]);
    setError(storeApi.getState().hydrationError);
    setLoading(false);
  }, [tripId, storeApi]);

  useEffect(() => { load(); }, [load]);

  // ── Derived data ──────────────────────────────────────────────────────────────
  // Memoised: calculateSettlements is O(members × expenses); nameMap/requestMap
  // allocate new Maps. None of these need to run unless their inputs change.

  // The ledger's credit side — only completed SplitRequests count as real
  // payments. Every completed row between a pair counts, not just the latest
  // (see requestMap below, which is a separate "latest status for display"
  // concept and stays that way on purpose).
  const completedPayments = useMemo<LedgerPayment[]>(
    () => splitRequests
      .filter(r => r.status === 'paid' || r.status === 'completed')
      .map(r => ({
        payerUserId: r.payerUserId,
        payeeUserId: r.requesterUserId,
        amountCents: r.amountCents,
        currency:    r.currency,
        id:          r.id,
        date:        r.updatedAt,
      })),
    [splitRequests],
  );

  const rawSettlements = useMemo(
    () => calculateSettlements(members, expenses, completedPayments),
    [members, expenses, completedPayments],
  );

  const nameMap = useMemo(
    () => new Map(members.map((m: TripMember) => [m.userId, m.displayName])),
    [members],
  );

  const requestMap = useMemo(() => {
    const map = new Map<string, SplitRequest>();
    for (const req of splitRequests) {
      const key  = `${req.payerUserId}:${req.requesterUserId}`;
      const prev = map.get(key);
      if (!prev || req.createdAt > prev.createdAt) map.set(key, req);
    }
    return map;
  }, [splitRequests]);

  const settlements: EnrichedSettlement[] = useMemo(
    () => rawSettlements.map((s) => ({
      ...s,
      fromDisplayName: nameMap.get(s.fromUserId) ?? s.fromUserId,
      toDisplayName:   nameMap.get(s.toUserId)   ?? s.toUserId,
      latestRequest:   requestMap.get(`${s.fromUserId}:${s.toUserId}`) ?? null,
    })),
    [rawSettlements, nameMap, requestMap],
  );

  const currentUserId = auth.currentUser()?.id ?? null;

  const tripStatus = useTripSessionStore(
    (s) => (s.trips.find(t => t.id === tripId)?.status ?? 'active') as TripStatus,
  );

  // ── Actions ───────────────────────────────────────────────────────────────────

  const updateRequestStatus = useCallback(
    async (req: SplitRequest, nextStatus: SplitRequest['status']): Promise<void> => {
      const updated = { ...req, status: nextStatus, updatedAt: new Date() };
      await storeApi.getState().updateSplitRequest(updated);
    },
    [storeApi],
  );

  const reopenTrip = useCallback(async (): Promise<void> => {
    await storeApi.getState().setTripStatus(tripId, 'active');
  }, [tripId, storeApi]);

  const closeTrip = useCallback(async (): Promise<void> => {
    await storeApi.getState().setTripStatus(tripId, 'closed');
  }, [tripId, storeApi]);


  // ── Stripe status polling ─────────────────────────────────────────────────────

  const pendingStripeReq = useMemo(() => {
    for (const s of settlements) {
      const req = s.latestRequest;
      if (req?.stripeSessionId) return req;
    }
    return null;
  }, [settlements]);

  useStripePoller(pendingStripeReq, (status: SplitRequestStatus) => {
    if (pendingStripeReq) void updateRequestStatus(pendingStripeReq, status);
  });

  // Appends a new completed SplitRequest for an arbitrary amount — the ledger's
  // sole write primitive. Deliberately always creates a new record rather than
  // looking for an existing one to flip: multiple payments between the same
  // pair are meant to all sum (see settlement.ts's ledger model), not overwrite
  // a single "latest" request the way the old markDebtPaid did.
  const recordPayment = useCallback(
    async (fromUserId: string, toUserId: string, amountCents: number, currency: string): Promise<void> => {
      setSettling(true);
      try {
        await storeApi.getState().saveSplitRequest(
          createManualPaymentRequest({ tripId, payerUserId: fromUserId, requesterUserId: toUserId, amountCents, currency }),
        );
      } finally {
        setSettling(false);
      }
    },
    [tripId, storeApi],
  );

  // A fully-paid pair now simply disappears from `settlements` (its net balance
  // is zero), so "all settled" can no longer be read off any row's status —
  // it's "there was debt at some point, and now there's none".
  const allSettled = useMemo(
    () => expenses.length > 0 && settlements.length === 0,
    [expenses, settlements],
  );

  return {
    settlements,
    members,
    expenses,
    splitRequests,
    loading,
    error,
    settling,
    currentUserId,
    tripStatus,
    allSettled,
    refetch:             load,
    updateRequestStatus,
    reopenTrip,
    closeTrip,
    recordPayment,
  };
}
