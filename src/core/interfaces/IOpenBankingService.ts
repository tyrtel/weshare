import type { Result } from '../types/Result';
import type { AppError } from '../types/AppError';
import type { SplitRequestStatus } from '../models/SplitRequest';

export type OBProvider = 'tink' | 'powens';

export interface OBInitiateResult {
  authorizationUrl: string;
  obPaymentId: string;
  obProvider: OBProvider;
}

export interface IOpenBankingService {
  /**
   * Initiate a SEPA payment via the OB aggregator.
   * Returns an authorization URL the payer must visit at their bank.
   */
  initiatePayment(
    splitRequestId: string,
    amountCents: number,
    currency: string,
    note: string,
    creditorIban: string,
  ): Promise<Result<OBInitiateResult, AppError>>;

  /**
   * Poll the aggregator for the current payment status.
   */
  getPaymentStatus(
    obPaymentId: string,
    obProvider: OBProvider,
  ): Promise<Result<SplitRequestStatus, AppError>>;

  /**
   * Open the bank authorization URL (system browser for OAuth redirect).
   */
  openAuthorizationUrl(url: string): Promise<void>;
}
