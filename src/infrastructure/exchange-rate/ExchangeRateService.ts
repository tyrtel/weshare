import { supabase } from '../supabase/supabaseClient';
import type { IExchangeRateService, RateResult } from '../../core/interfaces/IExchangeRateService';

// Hardcoded approximate fallback rates — last-resort tier when live API and
// Supabase cache are both unreachable. Values are indicative, not real-time.
const APPROXIMATE_RATES: Record<string, Record<string, number>> = {
  EUR: { USD: 1.08, GBP: 0.86, JPY: 161.5, CAD: 1.47, AUD: 1.65, CHF: 0.97 },
  USD: { EUR: 0.92, GBP: 0.80, JPY: 149.5, CAD: 1.36, AUD: 1.52, CHF: 0.89 },
  GBP: { EUR: 1.16, USD: 1.26, JPY: 187.9, CAD: 1.73, AUD: 1.94, CHF: 1.13 },
  JPY: { EUR: 0.0062, USD: 0.0067, GBP: 0.0053, CAD: 0.0091, AUD: 0.0102, CHF: 0.006 },
  CAD: { EUR: 0.68, USD: 0.74, GBP: 0.58, JPY: 110.0, AUD: 1.12, CHF: 0.66 },
  AUD: { EUR: 0.61, USD: 0.66, GBP: 0.52, JPY: 97.8,  CAD: 0.90, CHF: 0.59 },
  CHF: { EUR: 1.03, USD: 1.12, GBP: 0.89, JPY: 166.5, CAD: 1.52, AUD: 1.70 },
};

async function fetchFromFrankfurter(from: string, to: string): Promise<number | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(
      `https://api.frankfurter.app/latest?from=${from}&to=${to}`,
      { signal: controller.signal },
    );
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as { rates?: Record<string, number> };
    const rate = data.rates?.[to];
    return typeof rate === 'number' ? rate : null;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

async function readFromCache(from: string, to: string): Promise<RateResult | null> {
  const { data } = await supabase
    .from('exchange_rate_cache')
    .select('rate, updated_at')
    .eq('from_currency', from)
    .eq('to_currency', to)
    .maybeSingle();
  if (!data) return null;
  return {
    rate:     Number(data.rate),
    source:   'cached',
    cachedAt: new Date(data.updated_at),
  };
}

async function writeToCache(from: string, to: string, rate: number): Promise<void> {
  await supabase
    .from('exchange_rate_cache')
    .upsert(
      { from_currency: from, to_currency: to, rate, updated_at: new Date().toISOString() },
      { onConflict: 'from_currency,to_currency' },
    );
}

export class ExchangeRateService implements IExchangeRateService {
  async getRate(from: string, to: string): Promise<RateResult> {
    if (from === to) return { rate: 1, source: 'live' };

    // Tier 1 — live Frankfurter API (ECB daily rates, no key required)
    const liveRate = await fetchFromFrankfurter(from, to);
    if (liveRate !== null) {
      void writeToCache(from, to, liveRate);
      return { rate: liveRate, source: 'live' };
    }

    // Tier 2 — Supabase write-through cache
    try {
      const cached = await readFromCache(from, to);
      if (cached) return cached;
    } catch { /* fall through */ }

    // Tier 3 — hardcoded approximate rates
    const approx = APPROXIMATE_RATES[from]?.[to];
    if (approx !== undefined) return { rate: approx, source: 'approximate' };

    throw new Error(`No exchange rate available for ${from}→${to}`);
  }
}
