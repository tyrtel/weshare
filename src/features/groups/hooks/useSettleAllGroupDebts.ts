import { useState, useCallback } from 'react';
import { useService } from '../../../core/di/ServiceContext';
import { SPLIT_REQUEST_REPO, TRIP_STORE } from '../../../core/di/tokens';
import { isOk } from '../../../core/types/Result';
import { createManualPaymentRequest } from '../../../core/models/SplitRequest';
import type { Settlement } from '../../../core/models/Settlement';
import type { AppError } from '../../../core/types/AppError';

/**
 * Records a completed, group-scoped payment for every currently outstanding
 * settlement in the group — a thin convenience wrapper around the same
 * ledger primitive an individual "record a payment" action uses (see
 * useSettlement.ts's recordPayment), not a separate mechanism.
 *
 * Calls the repo directly (rather than the store's saveSplitRequest, which
 * only tracks one hydrationError at a time) so a partial failure among
 * several concurrent saves is reported correctly instead of racing.
 *
 * Phase 4c: this used to also mark every group expense settled and close
 * every active trip in the group. That conflated "pay off the debt" with
 * "archive this trip/expense" — two independently-meaningful actions now
 * that closing/settling no longer hides debt from the ledger. This action
 * only does the former; closing a trip is a separate, deliberate act.
 */
export function useSettleAllGroupDebts(groupId: string, settlements: Settlement[]) {
  const splitRequestRepo = useService(SPLIT_REQUEST_REPO);
  const storeApi         = useService(TRIP_STORE);

  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<AppError | null>(null);

  const settleAll = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    setError(null);

    const results = await Promise.all(
      settlements.map(s => splitRequestRepo.saveSplitRequest(
        createManualPaymentRequest({
          groupId,
          payerUserId:     s.fromUserId,
          requesterUserId: s.toUserId,
          amountCents:     s.amountCents,
          currency:        s.currency,
        }),
      )),
    );

    let firstError: AppError | null = null;
    for (const result of results) {
      if (isOk(result)) {
        storeApi.getState().appendSplitRequest(result.value);
      } else {
        firstError ??= result.error;
      }
    }

    setError(firstError);
    setLoading(false);
    return firstError === null;
  }, [groupId, settlements, splitRequestRepo, storeApi]);

  return { settleAll, loading, error };
}
