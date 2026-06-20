import type { RateSource } from '../models/Expense';

export type { RateSource };

export interface RateResult {
  rate:      number;
  source:    RateSource;
  cachedAt?: Date;
}

export interface IExchangeRateService {
  getRate(from: string, to: string): Promise<RateResult>;
}
