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
  tripId: string;
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
