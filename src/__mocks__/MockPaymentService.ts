import type { IPaymentService, PaymentRequest } from '../core/interfaces/IPaymentService';

export interface RecordedCall {
  method: 'generateDeepLink' | 'openPayment' | 'isAvailable';
  request?: PaymentRequest;
  timestamp: Date;
}

/**
 * Test double for IPaymentService.
 * Records every call so assertions can inspect exactly what was triggered.
 * Use `setAvailable(false)` to exercise error-handling paths.
 */
export class MockPaymentService implements IPaymentService {
  readonly providerName = 'Mock';

  private _calls: RecordedCall[] = [];
  private _available = true;

  get calls(): ReadonlyArray<RecordedCall> {
    return this._calls;
  }

  setAvailable(available: boolean): void {
    this._available = available;
  }

  clearCalls(): void {
    this._calls = [];
  }

  generateDeepLink(request: PaymentRequest): string {
    this._calls.push({ method: 'generateDeepLink', request, timestamp: new Date() });
    return `mock://pay?recipient=${request.recipientHandle}&amount=${request.amount.toFixed(2)}`;
  }

  async openPayment(request: PaymentRequest): Promise<void> {
    this._calls.push({ method: 'openPayment', request, timestamp: new Date() });
    if (!this._available) {
      throw new Error('Mock payment service is set to unavailable.');
    }
  }

  async isAvailable(): Promise<boolean> {
    this._calls.push({ method: 'isAvailable', timestamp: new Date() });
    return this._available;
  }
}
