import { Linking } from 'react-native';
import type { IPaymentService, PaymentRequest } from '../../core/interfaces/IPaymentService';

export class RevolutPaymentService implements IPaymentService {
  readonly providerName = 'Revolut';

  generateDeepLink(request: PaymentRequest): string {
    const description = encodeURIComponent(request.note);
    const amount = request.amount.toFixed(2);
    // Revolut deep-link format for requesting money from a user.
    return `revolut://pay?recipient=${request.recipientHandle}&amount=${amount}&currency=${request.currency}&description=${description}`;
  }

  async openPayment(request: PaymentRequest): Promise<void> {
    const url = this.generateDeepLink(request);
    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) {
      throw new Error('Revolut is not installed on this device.');
    }
    await Linking.openURL(url);
  }

  async isAvailable(): Promise<boolean> {
    return Linking.canOpenURL('revolut://');
  }
}
