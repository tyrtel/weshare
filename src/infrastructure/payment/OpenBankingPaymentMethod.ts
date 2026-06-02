import type { IPaymentMethod, PaymentLaunchParams, PaymentMethodMeta } from '../../core/interfaces/IPaymentMethod';
import type { ISplitRequestRepository } from '../../core/interfaces/ISplitRequestRepository';
import type { SplitRequest } from '../../core/models/SplitRequest';

export class OpenBankingPaymentMethod implements IPaymentMethod {
  readonly meta: PaymentMethodMeta = {
    key:         'open_banking',
    label:       'Bank Transfer',
    description: 'SEPA transfer via your bank',
    iconName:    'business-outline',
  };

  async canHandle(): Promise<boolean> {
    return true;
  }

  async launch(
    params: PaymentLaunchParams,
    _repo: ISplitRequestRepository,
  ): Promise<SplitRequest | null> {
    params.navigate('/settle/bank-transfer', {
      tripId:          params.tripId,
      payerUserId:     params.payerUserId,
      requesterUserId: params.requesterUserId,
      amountCents:     String(params.amountCents),
      currency:        params.currency,
      recipientName:   params.recipientName,
    });
    return null;
  }
}
