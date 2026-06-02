import type { IPaymentMethod, PaymentLaunchParams, PaymentMethodMeta } from '../../core/interfaces/IPaymentMethod';
import type { ISplitRequestRepository } from '../../core/interfaces/ISplitRequestRepository';
import type { IStripeService } from '../../core/interfaces/IStripeService';
import type { SplitRequest } from '../../core/models/SplitRequest';
import { isOk } from '../../core/types/Result';
import { generateId } from '../../core/utils/generateId';

export class StripePaymentMethod implements IPaymentMethod {
  readonly meta: PaymentMethodMeta = {
    key:         'stripe',
    label:       'Stripe',
    description: 'Send a secure payment link or QR',
    iconName:    'card',
    iconBg:      '#1a0040',
    iconColor:   '#635bff',
  };

  constructor(private readonly stripe: IStripeService) {}

  async canHandle(): Promise<boolean> {
    return true;
  }

  async launch(
    params: PaymentLaunchParams,
    repo: ISplitRequestRepository,
  ): Promise<SplitRequest | null> {
    const now   = new Date();
    const reqId = generateId();

    const sessionResult = await this.stripe.createCheckoutSession(
      reqId,
      params.tripId,
      params.payerUserId,
      params.amountCents,
      params.currency,
      params.note,
    );
    if (!isOk(sessionResult)) return null;

    const session = sessionResult.value;
    const req: SplitRequest = {
      id:                  reqId,
      tripId:              params.tripId,
      requesterUserId:     params.requesterUserId,
      payerUserId:         params.payerUserId,
      amountCents:         params.amountCents,
      currency:            params.currency,
      note:                params.note,
      status:              'request_sent',
      preferredWallet:     'other',
      externalRefId:       null,
      stripePaymentLinkId: session.stripePaymentLinkId,
      stripeSessionId:     session.stripeSessionId,
      obPaymentId:         null,
      obProvider:          null,
          rolledOverFromTripId: null,
      createdAt:           now,
      updatedAt:           now,
    };

    await repo.saveSplitRequest(req);
    await this.stripe.openCheckout(session.url);
    return req;
  }
}
