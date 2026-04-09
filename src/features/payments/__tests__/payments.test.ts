import { createTestContainer } from '../../../core/di/container';
import { MockPaymentService } from '../../../__mocks__/MockPaymentService';
import type { PaymentRequest } from '../../../core/interfaces/IPaymentService';

describe('Payments feature', () => {
  let paymentService: MockPaymentService;

  beforeEach(() => {
    const container = createTestContainer();
    paymentService = container.resolve('paymentService') as MockPaymentService;
  });

  it('generates a deep-link containing the recipient and amount', () => {
    const request: PaymentRequest = {
      recipientHandle: '@alice',
      amount: 50.0,
      currency: 'USD',
      note: 'Pizza dinner',
    };

    const link = paymentService.generateDeepLink(request);
    expect(link).toContain('@alice');
    expect(link).toContain('50.00');
  });

  it('records each call to generateDeepLink', () => {
    const request: PaymentRequest = {
      recipientHandle: '@bob',
      amount: 25.0,
      currency: 'USD',
      note: 'Fuel split',
    };
    paymentService.generateDeepLink(request);

    expect(paymentService.calls).toHaveLength(1);
    expect(paymentService.calls[0].method).toBe('generateDeepLink');
    expect(paymentService.calls[0].request?.recipientHandle).toBe('@bob');
  });

  it('records openPayment call when available', async () => {
    const request: PaymentRequest = {
      recipientHandle: '@carol',
      amount: 15.0,
      currency: 'EUR',
      note: 'Coffee',
    };

    await paymentService.openPayment(request);

    expect(paymentService.calls).toHaveLength(1);
    expect(paymentService.calls[0].method).toBe('openPayment');
    expect(paymentService.calls[0].request?.amount).toBe(15.0);
  });

  it('throws when the payment service is set to unavailable', async () => {
    paymentService.setAvailable(false);

    const request: PaymentRequest = {
      recipientHandle: '@dave',
      amount: 10.0,
      currency: 'USD',
      note: 'Snacks',
    };

    await expect(paymentService.openPayment(request)).rejects.toThrow('unavailable');
  });

  it('reports availability correctly', async () => {
    expect(await paymentService.isAvailable()).toBe(true);
    paymentService.setAvailable(false);
    expect(await paymentService.isAvailable()).toBe(false);
  });

  it('clearCalls resets the call log', () => {
    const request: PaymentRequest = {
      recipientHandle: '@eve',
      amount: 5.0,
      currency: 'USD',
      note: 'Tip',
    };
    paymentService.generateDeepLink(request);
    expect(paymentService.calls).toHaveLength(1);

    paymentService.clearCalls();
    expect(paymentService.calls).toHaveLength(0);
  });
});
