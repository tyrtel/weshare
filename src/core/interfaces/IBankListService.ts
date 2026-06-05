import type { Result } from '../types/Result';
import type { AppError } from '../types/AppError';

export interface Bank {
  id:      string;
  name:    string;
  logoUrl: string | null;
}

export interface IBankListService {
  /** Fetch available banks for a given two-letter market code (e.g. 'FR', 'GB'). */
  getBanks(market: string): Promise<Result<Bank[], AppError>>;
}
