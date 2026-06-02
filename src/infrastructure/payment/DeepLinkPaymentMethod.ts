import { Linking } from 'react-native';
import type { IPaymentMethod, PaymentLaunchParams, PaymentMethodMeta } from '../../core/interfaces/IPaymentMethod';
import type { ISplitRequestRepository } from '../../core/interfaces/ISplitRequestRepository';
import type { IPaymentService, PaymentProvider } from '../../core/interfaces/IPaymentService';
import type { SplitRequest } from '../../core/models/SplitRequest';
import { isOk } from '../../core/types/Result';
import { generateId } from '../../core/utils/generateId';

const PROVIDER_DISPLAY: Record<
  PaymentProvider,
  Pick<PaymentMethodMeta, 'label' | 'description' | 'iconName'>
> = {
  revolut: { label: 'Revolut', description: 'Open in Revolut app',          iconName: 'card-outline' },
  venmo:   { label: 'Venmo',   description: 'Open in Venmo app',             iconName: 'cash-outline' },
  lydia:   { label: 'Lydia',   description: 'Open in Lydia app',             iconName: 'phone-portrait-outline' },
  paypal:  { label: 'PayPal',  description: 'Send via PayPal.me',            iconName: 'logo-paypal' },
  other:   { label: 'Other',   description: 'Use a generic payment link',    iconName: 'ellipsis-horizontal-circle-outline' },
};

export class DeepLinkPaymentMethod implements IPaymentMethod {
  readonly meta: PaymentMethodMeta;

  constructor(
    private readonly provider: PaymentProvider,
    private readonly service: IPaymentService,
  ) {
    this.meta = { key: provider, ...PROVIDER_DISPLAY[provider] };
  }

  async canHandle(): Promise<boolean> {
    const wallets = await this.service.getInstalledWallets();
    return wallets.includes(this.provider);
  }

  async launch(
    params: PaymentLaunchParams,
    repo: ISplitRequestRepository,
  ): Promise<SplitRequest | null> {
    const url = this.service.buildPaymentLink(
      this.provider,
      params.amountCents,
      params.currency,
      params.recipientName,
    );

    const now = new Date();
    const req: SplitRequest = {
      id:                  generateId(),
      tripId:              params.tripId,
      requesterUserId:     params.requesterUserId,
      payerUserId:         params.payerUserId,
      amountCents:         params.amountCents,
      currency:            params.currency,
      note:                params.note,
      status:              'created',
      preferredWallet:     this.provider,
      externalRefId:       null,
      stripePaymentLinkId: null,
      stripeSessionId:     null,
      obPaymentId:         null,
      obProvider:          null,
          rolledOverFromTripId: null,
      createdAt:           now,
      updatedAt:           now,
    };

    const saveResult = await repo.saveSplitRequest(req);
    const savedReq   = isOk(saveResult) ? saveResult.value : req;
    const sentReq    = { ...savedReq, status: 'request_sent' as const, updatedAt: new Date() };
    await repo.updateSplitRequest(sentReq);

    const canOpen = await Linking.canOpenURL(url).catch(() => false);
    if (canOpen) await Linking.openURL(url).catch(() => undefined);

    return sentReq;
  }
}
