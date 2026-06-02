import { ok, err } from '../core/types/Result';
import type { Result } from '../core/types/Result';
import type { AppError } from '../core/types/AppError';
import type { SplitRequestStatus } from '../core/models/SplitRequest';
import type { IStripeService, StripeCheckoutSession } from '../core/interfaces/IStripeService';

export interface CheckoutSessionCall {
  splitRequestId: string;
  tripId: string;
  payerUserId: string;
  amountCents: number;
  currency: string;
  note: string;
}

export class MockStripeService implements IStripeService {
  readonly sessionCalls: CheckoutSessionCall[] = [];
  readonly openedUrls: string[]                = [];

  // Override to simulate success/failure.
  mockSession: StripeCheckoutSession = {
    url:                 'https://checkout.stripe.com/mock',
    stripeSessionId:     'mock_cs_test',
    stripePaymentLinkId: null,
  };
  mockStatus: SplitRequestStatus = 'pending';
  shouldFail = false;

  async createCheckoutSession(
    splitRequestId: string,
    tripId: string,
    payerUserId: string,
    amountCents: number,
    currency: string,
    note: string,
  ): Promise<Result<StripeCheckoutSession, AppError>> {
    this.sessionCalls.push({ splitRequestId, tripId, payerUserId, amountCents, currency, note });
    if (this.shouldFail) return err({ kind: 'NetworkError', message: 'Mock failure' });
    return ok({ ...this.mockSession });
  }

  async getPaymentStatus(_stripeSessionId: string): Promise<Result<SplitRequestStatus, AppError>> {
    if (this.shouldFail) return err({ kind: 'NetworkError', message: 'Mock failure' });
    return ok(this.mockStatus);
  }

  async openCheckout(url: string): Promise<void> {
    this.openedUrls.push(url);
  }
}
