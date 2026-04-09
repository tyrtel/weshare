import { Linking } from 'react-native';
import type { IPaymentService, PaymentRequest } from '../../core/interfaces/IPaymentService';

export class VenmoPaymentService implements IPaymentService {
  readonly providerName = 'Venmo';

  generateDeepLink(request: PaymentRequest): string {
    const note = encodeURIComponent(request.note);
    const amount = request.amount.toFixed(2);
    // Venmo deep-link spec: https://venmo.com/about/api/
    return `venmo://paycharge?txn=pay&recipients=${request.recipientHandle}&amount=${amount}&note=${note}`;
  }

  async openPayment(request: PaymentRequest): Promise<void> {
    const url = this.generateDeepLink(request);
    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) {
      throw new Error('Venmo is not installed on this device.');
    }
    await Linking.openURL(url);
  }

  async isAvailable(): Promise<boolean> {
    return Linking.canOpenURL('venmo://');
  }
}
