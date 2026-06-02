export type PaymentProvider = 'revolut' | 'venmo' | 'lydia' | 'paypal' | 'other';

export interface IPaymentService {
  // Builds a deep-link URL without opening it — pure string, no side effects.
  // amount is in integer cents; the implementation formats for the provider.
  buildPaymentLink(
    provider: PaymentProvider,
    amountCents: number,
    currency: string,
    recipientHandle: string,
  ): string;

  // Returns providers whose native app is installed on this device.
  // PayPal and 'other' are always included as web-based fallbacks.
  getInstalledWallets(): Promise<PaymentProvider[]>;
}
