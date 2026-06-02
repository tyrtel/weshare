import { ok, err } from '../core/types/Result';
import type { Result } from '../core/types/Result';
import type { AppError } from '../core/types/AppError';
import type { IOpenBankingService, OBInitiateResult, OBProvider } from '../core/interfaces/IOpenBankingService';
import type { SplitRequestStatus } from '../core/models/SplitRequest';

export interface InitiateCall {
  splitRequestId: string;
  amountCents:    number;
  currency:       string;
  creditorIban:   string;
}

export class MockOpenBankingService implements IOpenBankingService {
  shouldFail = false;
  mockPaymentId    = 'mock_tink_test';
  mockProvider: OBProvider = 'tink';
  mockStatus: SplitRequestStatus = 'pending';

  initiateCalls: InitiateCall[] = [];
  openedUrls:    string[]       = [];

  async initiatePayment(
    splitRequestId: string,
    amountCents: number,
    currency: string,
    _note: string,
    creditorIban: string,
  ): Promise<Result<OBInitiateResult, AppError>> {
    this.initiateCalls.push({ splitRequestId, amountCents, currency, creditorIban });

    if (this.shouldFail) {
      return err({ kind: 'NetworkError', message: 'MockOpenBankingService: forced failure' });
    }

    return ok({
      authorizationUrl: `https://link.tink.com/1.0/pay?paymentRequestId=${this.mockPaymentId}`,
      obPaymentId:      this.mockPaymentId,
      obProvider:       this.mockProvider,
    });
  }

  async getPaymentStatus(
    _obPaymentId: string,
    _obProvider: OBProvider,
  ): Promise<Result<SplitRequestStatus, AppError>> {
    if (this.shouldFail) {
      return err({ kind: 'NetworkError', message: 'MockOpenBankingService: forced failure' });
    }
    return ok(this.mockStatus);
  }

  async openAuthorizationUrl(url: string): Promise<void> {
    this.openedUrls.push(url);
  }
}
