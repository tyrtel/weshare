import { useService } from '../../../core/di/ServiceContext';
import { STRIPE } from '../../../core/di/tokens';
import { useStatusPoller } from '../../../hooks/useStatusPoller';
import { isOk } from '../../../core/types/Result';
import type { SplitRequest, SplitRequestStatus } from '../../../core/models/SplitRequest';

// Statuses where a Stripe Checkout session is open and worth polling.
const STRIPE_POLLABLE = new Set<SplitRequestStatus>(['created', 'request_sent', 'pending', 'authorized']);

const POLL_INTERVAL_MS = 5_000;

/**
 * Polls Stripe for an updated payment status on the given SplitRequest.
 * Calls `onStatusChange` each time a status is received.
 * Polling is a no-op when the request is null, has no stripeSessionId,
 * or is already in a non-pollable status (completed / declined / expired / owed / paid).
 */
export function useStripePoller(
  splitRequest: SplitRequest | null,
  onStatusChange: (status: SplitRequestStatus) => void,
): void {
  const stripeService = useService(STRIPE);

  const enabled = !!(
    splitRequest?.stripeSessionId &&
    STRIPE_POLLABLE.has(splitRequest.status)
  );

  useStatusPoller(
    async () => {
      if (!splitRequest?.stripeSessionId) return null;
      const result = await stripeService.getPaymentStatus(splitRequest.stripeSessionId);
      return isOk(result) ? result.value : null;
    },
    POLL_INTERVAL_MS,
    onStatusChange,
    enabled,
  );
}
