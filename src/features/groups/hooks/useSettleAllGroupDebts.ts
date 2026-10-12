import { useCallback } from 'react';
import { useService } from '../../../core/di/ServiceContext';
import { TRIP_STORE } from '../../../core/di/tokens';
import { createManualPaymentRequest } from '../../../core/models/SplitRequest';
import type { Settlement } from '../../../core/models/Settlement';

/**
 * Records a completed, group-scoped payment for every currently outstanding
 * settlement in the group — a thin convenience wrapper around the same
 * ledger primitive an individual "record a payment" action uses (see
 * useSettlement.ts's recordPayment), not a separate mechanism.
 *
 * Save-first: every payment appears at once; any the server refuses are
 * undone individually by the store, which surfaces writeError.
 *
 * Phase 4c: this used to also mark every group expense settled and close
 * every active trip in the group. That conflated "pay off the debt" with
 * "archive this trip/expense" — two independently-meaningful actions now
 * that closing/settling no longer hides debt from the ledger. This action
 * only does the former; closing a trip is a separate, deliberate act.
 */
export function useSettleAllGroupDebts(groupId: string, settlements: Settlement[]) {
  const storeApi = useService(TRIP_STORE);

  const settleAll = useCallback((): void => {
    for (const s of settlements) {
      void storeApi.getState().saveSplitRequest(createManualPaymentRequest({
        groupId,
        payerUserId:     s.fromUserId,
        requesterUserId: s.toUserId,
        amountCents:     s.amountCents,
        currency:        s.currency,
      }));
    }
  }, [groupId, settlements, storeApi]);

  return { settleAll };
}
