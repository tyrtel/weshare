import type { PaymentProvider } from '../interfaces/IPaymentService';
import type { OBProvider } from '../interfaces/IOpenBankingService';

export type SplitRequestStatus =
  | 'owed'          // manually tracked — initial state, debt not yet paid
  | 'paid'          // manually marked by any trip participant; can be reverted
  | 'created'
  | 'request_sent'
  | 'authorized'    // OB: bank authorized, SEPA in transit
  | 'pending'
  | 'completed'
  | 'declined'
  | 'expired';

/** Statuses that belong to an in-flight or finished payment flow — cannot be manually reverted. */
export const PAYMENT_FLOW_STATUSES = new Set<SplitRequestStatus>([
  'created', 'request_sent', 'authorized', 'pending', 'completed', 'declined', 'expired',
]);

export interface SplitRequest {
  id: string;
  tripId?: string;
  groupId?: string;
  requesterUserId: string;  // creditor — the person owed money
  payerUserId: string;      // debtor — the person sending money
  amountCents: number;
  currency: string;
  note: string;
  status: SplitRequestStatus;
  preferredWallet: PaymentProvider;
  externalRefId: string | null;       // generic external reference
  stripePaymentLinkId: string | null; // Stripe Payment Link ID (pl_xxx)
  stripeSessionId: string | null;     // Stripe Checkout Session ID (cs_xxx)
  obPaymentId: string | null;         // Tink / aggregator payment ID
  obProvider: OBProvider | null;
  rolledOverFromTripId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Builds a completed SplitRequest for a manually-recorded payment — the
 * ledger's write primitive (see core/logic/settlement.ts's LedgerPayment).
 * Scope is trip-or-group, matching every other trip/group-dual model.
 */
export function createManualPaymentRequest(params: {
  tripId?: string;
  groupId?: string;
  payerUserId: string;
  requesterUserId: string;
  amountCents: number;
  currency: string;
}): SplitRequest {
  return {
    id:                  `sr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    tripId:              params.tripId,
    groupId:             params.groupId,
    requesterUserId:     params.requesterUserId,
    payerUserId:         params.payerUserId,
    amountCents:         params.amountCents,
    currency:            params.currency,
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
}
