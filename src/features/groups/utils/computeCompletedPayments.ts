import type { LedgerPayment } from '../../../core/logic/settlement';
import type { SplitRequest } from '../../../core/models/SplitRequest';
import type { Trip } from '../../../core/models/Trip';

// A payment made to settle one trip inside a group still nets against the
// group's overall balance, so the group-level ledger needs both scopes'
// completed split requests merged into one credit-side list.
export function computeCompletedGroupPayments(
  groupSplitRequests: SplitRequest[],
  groupTrips: Trip[],
  tripSplitRequests: Record<string, SplitRequest[]>,
): LedgerPayment[] {
  const allRequests: SplitRequest[] = [
    ...groupSplitRequests,
    ...groupTrips.flatMap(t => tripSplitRequests[t.id] ?? []),
  ];
  return allRequests
    .filter(r => r.status === 'paid' || r.status === 'completed')
    .map(r => ({
      payerUserId: r.payerUserId,
      payeeUserId: r.requesterUserId,
      amountCents: r.amountCents,
      currency:    r.currency,
      id:          r.id,
      date:        r.updatedAt,
    }));
}
