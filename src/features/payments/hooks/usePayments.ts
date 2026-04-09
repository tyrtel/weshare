import { useCallback } from 'react';
import { useContainer } from '../../../core/di/ServiceContext';
import type { PaymentRequest } from '../../../core/interfaces/IPaymentService';

export function usePayments() {
  const paymentService = useContainer().resolve('paymentService');

  const pay = useCallback(
    async (request: PaymentRequest): Promise<void> => {
      await paymentService.openPayment(request);
    },
    [paymentService],
  );

  const generateLink = useCallback(
    (request: PaymentRequest): string => {
      return paymentService.generateDeepLink(request);
    },
    [paymentService],
  );

  const checkAvailability = useCallback(
    async (): Promise<boolean> => {
      return paymentService.isAvailable();
    },
    [paymentService],
  );

  return {
    pay,
    generateLink,
    checkAvailability,
    providerName: paymentService.providerName,
  };
}
