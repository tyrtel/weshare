import type { IPaymentService, PaymentProvider } from '../core/interfaces/IPaymentService';

export interface PaymentLinkCall {
  provider: PaymentProvider;
  amountCents: number;
  currency: string;
  recipientHandle: string;
}

export class MockPaymentService implements IPaymentService {
  readonly calls: PaymentLinkCall[] = [];

  // Override in tests to control which wallets are "installed".
  installedWallets: PaymentProvider[] = ['revolut', 'venmo', 'lydia', 'paypal', 'other'];

  buildPaymentLink(
    provider: PaymentProvider,
    amountCents: number,
    currency: string,
    recipientHandle: string,
  ): string {
    this.calls.push({ provider, amountCents, currency, recipientHandle });
    return `${provider}://pay/${recipientHandle}?amount=${amountCents}&currency=${currency}`;
  }

  async getInstalledWallets(): Promise<PaymentProvider[]> {
    return [...this.installedWallets];
  }
}
