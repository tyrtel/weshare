import { useState, useMemo, useCallback } from 'react';
import { useService, useTripSessionStore } from '../../../core/di/ServiceContext';
import { TRIP_STORE } from '../../../core/di/tokens';
import { matchParticipants } from '../../../core/logic/participantMatcher';
import { computeRolloverDebts } from '../../../core/logic/rollover';
import { selectMembers } from '../../../store/selectors';
import type { RolloverDebtSeed } from '../../../core/logic/rollover';
import type { EnrichedSettlement } from './useSettlement';
import type { Trip } from '../../../core/models/Trip';
import type { TripMember } from '../../../core/models/TripMember';
import type { SplitRequest } from '../../../core/models/SplitRequest';
import type { AppError } from '../../../core/types/AppError';

export type RolloverStep = 'pick-trip' | 'match-participants' | 'review-debts' | 'confirm';

export interface ManualMatchMap {
  matched: Map<string, string>;   // sourceUserId → targetUserId
  unmatched: TripMember[];        // source members with no target
}

export interface UseRolloverResult {
  step: RolloverStep;
  availableTrips: Trip[];
  targetTripId: string | null;
  targetMembers: TripMember[];
  manualMatch: ManualMatchMap | null;
  seeds: RolloverDebtSeed[];
  selectedIndices: Set<number>;
  loading: boolean;
  error: AppError | null;
  selectTargetTrip: (tripId: string) => void;
  overrideMatch: (sourceUserId: string, targetUserId: string) => void;
  removeMatch: (sourceUserId: string) => void;
  toggleSeedSelection: (index: number) => void;
  goNext: () => void;
  goBack: () => void;
  confirm: () => Promise<boolean>;
}

const EMPTY_TRIPS: Trip[] = [];

export function useRollover(
  sourceTripId: string,
  settlements: EnrichedSettlement[],
): UseRolloverResult {
  const storeApi = useService(TRIP_STORE);

  const allTrips      = useTripSessionStore((s) => s.trips        ?? EMPTY_TRIPS);
  const sourceMembers = useTripSessionStore((s) => selectMembers(s, sourceTripId));

  const [step,             setStep]             = useState<RolloverStep>('pick-trip');
  const [targetTripId,     setTargetTripId]     = useState<string | null>(null);
  const [matchedMap,       setMatchedMap]       = useState<Map<string, string>>(new Map());
  const [unmatchedMembers, setUnmatchedMembers] = useState<TripMember[]>([]);
  const [selectedIndices,  setSelectedIndices]  = useState<Set<number>>(new Set());
  const [loading,          setLoading]          = useState(false);
  const [error,            setError]            = useState<AppError | null>(null);

  const targetMembers = useTripSessionStore(
    (s) => targetTripId ? selectMembers(s, targetTripId) : [],
  );

  const availableTrips = useMemo(
    () => allTrips.filter(t => t.id !== sourceTripId && t.status !== 'closed'),
    [allTrips, sourceTripId],
  );

  const manualMatch: ManualMatchMap | null = useMemo(() => {
    if (!targetTripId) return null;
    return { matched: matchedMap, unmatched: unmatchedMembers };
  }, [targetTripId, matchedMap, unmatchedMembers]);

  const seeds: RolloverDebtSeed[] = useMemo(() => {
    if (!manualMatch) return [];
    return computeRolloverDebts(settlements, manualMatch.matched, sourceTripId);
  }, [settlements, manualMatch, sourceTripId]);

  const selectTargetTrip = useCallback(
    async (tripId: string): Promise<void> => {
      setLoading(true);
      setError(null);
      setTargetTripId(tripId);

      await storeApi.getState().loadTripDetail(tripId);

      // Use the fresh snapshot so we never act on stale closure data.
      const freshMembers = selectMembers(storeApi.getState(), tripId);
      const result       = matchParticipants(sourceMembers, freshMembers);
      setMatchedMap(result.matchMap);
      setUnmatchedMembers(result.unmatched);

      setLoading(false);
      setStep('match-participants');
    },
    [storeApi, sourceMembers],
  );

  const overrideMatch = useCallback((sourceUserId: string, targetUserId: string): void => {
    setMatchedMap(prev => new Map([...prev, [sourceUserId, targetUserId]]));
    setUnmatchedMembers(prev => prev.filter(m => m.userId !== sourceUserId));
  }, []);

  const removeMatch = useCallback(
    (sourceUserId: string): void => {
      setMatchedMap(prev => {
        const next = new Map(prev);
        next.delete(sourceUserId);
        return next;
      });
      const member = sourceMembers.find(m => m.userId === sourceUserId);
      if (member) setUnmatchedMembers(prev => [...prev, member]);
    },
    [sourceMembers],
  );

  const toggleSeedSelection = useCallback((index: number): void => {
    setSelectedIndices(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const goNext = useCallback((): void => {
    if (step === 'match-participants') {
      // Initialize all seeds as selected when entering the review step.
      setSelectedIndices(new Set(seeds.map((_, i) => i)));
    }
    setStep(current => {
      switch (current) {
        case 'pick-trip':          return 'match-participants';
        case 'match-participants': return 'review-debts';
        case 'review-debts':       return 'confirm';
        default:                   return current;
      }
    });
  }, [step, seeds]);

  const goBack = useCallback((): void => {
    setStep(current => {
      switch (current) {
        case 'match-participants': return 'pick-trip';
        case 'review-debts':       return 'match-participants';
        case 'confirm':            return 'review-debts';
        default:                   return current;
      }
    });
  }, []);

  const confirm = useCallback(async (): Promise<boolean> => {
    if (!targetTripId) return false;
    setLoading(true);
    setError(null);

    const chosen = seeds.filter((_, i) => selectedIndices.has(i));

    try {
      await Promise.all(
        chosen.map((seed) => {
          const req: SplitRequest = {
            id:                  `sr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
            tripId:              targetTripId,
            requesterUserId:     seed.toUserId,
            payerUserId:         seed.fromUserId,
            amountCents:         seed.amountCents,
            currency:            seed.currency,
            note:                '',
            status:              'owed',
            preferredWallet:     'other',
            externalRefId:       null,
            stripePaymentLinkId: null,
            stripeSessionId:     null,
            obPaymentId:         null,
            obProvider:          null,
            rolledOverFromTripId: seed.rolledOverFromTripId,
            createdAt:           new Date(),
            updatedAt:           new Date(),
          };
          return storeApi.getState().saveSplitRequest(req);
        }),
      );
      setLoading(false);
      return true;
    } catch {
      setError({ kind: 'NetworkError', message: 'Failed to save rolled-over debts' });
      setLoading(false);
      return false;
    }
  }, [targetTripId, seeds, selectedIndices, storeApi]);

  return {
    step,
    availableTrips,
    targetTripId,
    targetMembers,
    manualMatch,
    seeds,
    selectedIndices,
    loading,
    error,
    selectTargetTrip,
    overrideMatch,
    removeMatch,
    toggleSeedSelection,
    goNext,
    goBack,
    confirm,
  };
}
