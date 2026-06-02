import type { Result } from '../types/Result';
import type { AppError } from '../types/AppError';
import type { SplitRequestStatus } from '../models/SplitRequest';

export interface StripeCheckoutSession {
  url: string;
  stripeSessionId: string;
  stripePaymentLinkId: string | null;
}

export interface IStripeService {
  // Creates a Stripe Checkout Session for the given split request.
  // Returns the checkout URL plus Stripe identifiers to persist on the SplitRequest.
  createCheckoutSession(
    splitRequestId: string,
    tripId: string,
    payerUserId: string,
    amountCents: number,
    currency: string,
    note: string,
  ): Promise<Result<StripeCheckoutSession, AppError>>;

  // Fetches the current payment status from the backend.
  // Maps Stripe session state to our internal SplitRequestStatus.
  getPaymentStatus(stripeSessionId: string): Promise<Result<SplitRequestStatus, AppError>>;

  // Opens the checkout URL in the system browser.
  // The success_url redirects to ouishare://payment-return?split_request_id=XXX
  openCheckout(url: string): Promise<void>;
}
