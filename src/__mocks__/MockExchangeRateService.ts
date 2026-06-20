import type { IExchangeRateService, RateResult } from '../core/interfaces/IExchangeRateService';

const MOCK_RATES: Record<string, Record<string, number>> = {
  EUR: { USD: 1.08, GBP: 0.86, JPY: 161.5, CAD: 1.47, AUD: 1.65, CHF: 0.97 },
  USD: { EUR: 0.92, GBP: 0.80, JPY: 149.5, CAD: 1.36, AUD: 1.52, CHF: 0.89 },
  GBP: { EUR: 1.16, USD: 1.26, JPY: 187.9, CAD: 1.73, AUD: 1.94, CHF: 1.13 },
  JPY: { EUR: 0.0062, USD: 0.0067, GBP: 0.0053, CAD: 0.0091, AUD: 0.0102, CHF: 0.006 },
  CAD: { EUR: 0.68, USD: 0.74, GBP: 0.58, JPY: 110.0, AUD: 1.12, CHF: 0.66 },
  AUD: { EUR: 0.61, USD: 0.66, GBP: 0.52, JPY: 97.8,  CAD: 0.90, CHF: 0.59 },
  CHF: { EUR: 1.03, USD: 1.12, GBP: 0.89, JPY: 166.5, CAD: 1.52, AUD: 1.70 },
};

export class MockExchangeRateService implements IExchangeRateService {
  delay      = 800;
  shouldFail = false;

  async getRate(from: string, to: string): Promise<RateResult> {
    await new Promise(r => setTimeout(r, this.delay));
    if (this.shouldFail) throw new Error('RATE_FETCH_FAILED: Mock failure');
    const rate = from === to ? 1 : (MOCK_RATES[from]?.[to] ?? 1);
    return { rate, source: 'live' };
  }
}
