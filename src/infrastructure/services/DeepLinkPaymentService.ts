import { Linking } from 'react-native';
import type { IPaymentService, PaymentProvider } from '../../core/interfaces/IPaymentService';

// Custom schemes probed to determine if the native app is installed.
// 'paypal' and 'other' are always shown: paypal.me is a plain web URL,
// and 'other' is the generic HTTPS fallback.
const NATIVE_SCHEMES: Record<PaymentProvider, string | null> = {
  revolut: 'revolut://',
  venmo:   'venmo://',
  lydia:   'lydia://',
  paypal:  null,   // always available via paypal.me web URL
  other:   null,   // always available as HTTPS fallback
};

export class DeepLinkPaymentService implements IPaymentService {
  buildPaymentLink(
    provider: PaymentProvider,
    amountCents: number,
    currency: string,
    recipientHandle: string,
  ): string {
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      throw new Error(`buildPaymentLink: amountCents must be a positive finite number (got ${amountCents})`);
    }
    const amount = (amountCents / 100).toFixed(2);
    const handle = encodeURIComponent(recipientHandle);

    switch (provider) {
      case 'revolut':
        // Revolut Pay deep-link: opens the send-money flow pre-filled.
        return `revolut://pay?recipient=${handle}&amount=${amount}&currency=${currency}`;

      case 'venmo':
        // Venmo Pay API deep-link.
        return `venmo://paycharge?txn=pay&recipients=${handle}&amount=${amount}&note=ouiShare`;

      case 'lydia':
        // Lydia request-money deep-link.
        return `lydia://request?amount=${amount}&note=ouiShare&to=${handle}`;

      case 'paypal':
        // PayPal.me works as a web URL — no custom scheme needed.
        return `https://paypal.me/${handle}/${amount}`;

      case 'other':
        // Generic HTTPS fallback.
        return `https://pay.ouishare.app/send?to=${handle}&amount=${amount}&currency=${currency}`;
    }
  }

  async getInstalledWallets(): Promise<PaymentProvider[]> {
    const providers = Object.keys(NATIVE_SCHEMES) as PaymentProvider[];

    const results = await Promise.all(
      providers.map(async (provider) => {
        const scheme = NATIVE_SCHEMES[provider];
        if (scheme === null) return provider; // always available
        const available = await Linking.canOpenURL(scheme).catch(() => false);
        return available ? provider : null;
      }),
    );

    return results.filter((p): p is PaymentProvider => p !== null);
  }
}
