import { useState, useEffect, useCallback, useMemo } from 'react';
import { useService, useTripSessionStore } from '../../../core/di/ServiceContext';
import { TRIP_STORE, AUTH } from '../../../core/di/tokens';
import { calculateSettlements } from '../../../core/logic/settlement';
import { useStripePoller } from './useStripePoller';
import { selectExpenses, selectMembers, selectSplitRequests } from '../../../store/selectors';
import type { Settlement } from '../../../core/models/Settlement';
import type { SplitRequest, SplitRequestStatus } from '../../../core/models/SplitRequest';
import { PAYMENT_FLOW_STATUSES } from '../../../core/models/SplitRequest';
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

  const rawSettlements = useMemo(
    () => calculateSettlements(members, expenses),
    [members, expenses],
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

  const markSettled = useCallback(
    async (fromUserId: string, toUserId: string): Promise<boolean> => {
      setSettling(true);

      // Read the current store snapshot so we never act on a stale closure.
      const currentExpenses = selectExpenses(storeApi.getState(), tripId);
      const splits = currentExpenses
        .filter((e) => e.paidByUserId === toUserId)
        .flatMap((e) =>
          e.splits.filter(
            (s) => s.userId === fromUserId && s.settledAt === undefined,
          ),
        );

      const results = await Promise.allSettled(
        splits.map((s) => storeApi.getState().markSettled(s)),
      );

      let firstError: AppError | null = null;
      for (const r of results) {
        if (r.status === 'rejected') {
          firstError ??= { kind: 'NetworkError', message: 'Settlement failed unexpectedly' };
        } else if (!r.value.ok) {
          firstError ??= r.value.error;
        }
      }

      if (firstError !== null) {
        setError(firstError);
        setSettling(false);
        return false;
      }

      setSettling(false);
      return true;
    },
    [tripId, storeApi],
  );

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

  const markDebtPaid = useCallback(
    async (fromUserId: string, toUserId: string): Promise<void> => {
      const existing = requestMap.get(`${fromUserId}:${toUserId}`);
      if (existing) {
        const updated = { ...existing, status: 'paid' as const, updatedAt: new Date() };
        await storeApi.getState().updateSplitRequest(updated);
      } else {
        const settlement = settlements.find(
          s => s.fromUserId === fromUserId && s.toUserId === toUserId,
        );
        if (!settlement) return;
        const newReq: SplitRequest = {
          id:                  `sr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
          tripId,
          requesterUserId:     toUserId,
          payerUserId:         fromUserId,
          amountCents:         settlement.amountCents,
          currency:            settlement.currency,
          note:                '',
          status:              'paid',
          preferredWallet:     'other',
          externalRefId:       null,
          stripePaymentLinkId: null,
          stripeSessionId:     null,
          obPaymentId:         null,
          obProvider:          null,
          rolledOverFromTripId: null,
          createdAt:           new Date(),
          updatedAt:           new Date(),
        };
        await storeApi.getState().saveSplitRequest(newReq);
      }
    },
    [tripId, storeApi, requestMap, settlements],
  );

  const markDebtOwed = useCallback(
    async (fromUserId: string, toUserId: string): Promise<void> => {
      const existing = requestMap.get(`${fromUserId}:${toUserId}`);
      if (!existing || PAYMENT_FLOW_STATUSES.has(existing.status)) return;
      const updated = { ...existing, status: 'owed' as const, updatedAt: new Date() };
      await storeApi.getState().updateSplitRequest(updated);
    },
    [storeApi, requestMap],
  );

  const allSettled = useMemo(
    () => settlements.length > 0 && settlements.every(s => {
      const st = s.latestRequest?.status ?? null;
      return st === 'paid' || st === 'completed';
    }),
    [settlements],
  );

  return {
    settlements,
    members,
    splitRequests,
    loading,
    error,
    settling,
    currentUserId,
    tripStatus,
    allSettled,
    refetch:             load,
    markSettled,
    updateRequestStatus,
    reopenTrip,
    closeTrip,
    markDebtPaid,
    markDebtOwed,
  };
}
