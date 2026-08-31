jest.mock('../supabase/supabaseClient', () => ({
  supabase: { from: jest.fn() },
}));

import { ExchangeRateService } from '../exchange-rate/ExchangeRateService';

const { supabase } = require('../supabase/supabaseClient') as { supabase: { from: jest.Mock } };

// Chainable mock covering both the cache-read shape
// (.select().eq().eq().maybeSingle()) and the cache-write shape (.upsert()).
function mockCacheTable() {
  const chain: {
    select: jest.Mock;
    eq: jest.Mock;
    maybeSingle: jest.Mock;
    upsert: jest.Mock;
  } = {
    select:      jest.fn(),
    eq:          jest.fn(),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    upsert:      jest.fn().mockResolvedValue({ data: null, error: null }),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  return chain;
}

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn();
});

describe('ExchangeRateService — same-currency short circuit', () => {
  it('returns rate 1 without calling fetch or Supabase when from === to', async () => {
    const service = new ExchangeRateService();
    const result = await service.getRate('EUR', 'EUR');

    expect(result).toEqual({ rate: 1, source: 'live' });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

describe('ExchangeRateService — tier 1: live Frankfurter API', () => {
  it('returns the live rate and writes through to the cache', async () => {
    const chain = mockCacheTable();
    supabase.from.mockReturnValue(chain);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok:   true,
      json: jest.fn().mockResolvedValue({ rates: { USD: 1.08 } }),
    });

    const service = new ExchangeRateService();
    const result = await service.getRate('EUR', 'USD');

    expect(result).toEqual({ rate: 1.08, source: 'live' });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('from=EUR&to=USD'),
      expect.objectContaining({ signal: expect.anything() }),
    );
    // Write-through is fire-and-forget (`void writeToCache(...)`), but the
    // Supabase call itself is issued synchronously before the first await.
    expect(supabase.from).toHaveBeenCalledWith('exchange_rate_cache');
    expect(chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ from_currency: 'EUR', to_currency: 'USD', rate: 1.08 }),
      { onConflict: 'from_currency,to_currency' },
    );
  });

  it('falls through to the next tier when the API responds with a non-2xx status', async () => {
    const chain = mockCacheTable();
    chain.maybeSingle.mockResolvedValue({
      data:  { rate: '1.09', updated_at: '2026-07-01T00:00:00.000Z' },
      error: null,
    });
    supabase.from.mockReturnValue(chain);
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false });

    const result = await (new ExchangeRateService()).getRate('EUR', 'USD');

    expect(result.source).toBe('cached');
  });

  it('falls through to the next tier when the response has no usable rate', async () => {
    const chain = mockCacheTable();
    chain.maybeSingle.mockResolvedValue({
      data:  { rate: '1.09', updated_at: '2026-07-01T00:00:00.000Z' },
      error: null,
    });
    supabase.from.mockReturnValue(chain);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok:   true,
      json: jest.fn().mockResolvedValue({ rates: {} }),
    });

    const result = await (new ExchangeRateService()).getRate('EUR', 'USD');

    expect(result.source).toBe('cached');
  });

  it('falls through to the next tier when fetch throws (network error / timeout abort)', async () => {
    const chain = mockCacheTable();
    chain.maybeSingle.mockResolvedValue({
      data:  { rate: '1.09', updated_at: '2026-07-01T00:00:00.000Z' },
      error: null,
    });
    supabase.from.mockReturnValue(chain);
    (global.fetch as jest.Mock).mockRejectedValue(new Error('AbortError'));

    const result = await (new ExchangeRateService()).getRate('EUR', 'USD');

    expect(result.source).toBe('cached');
  });
});

describe('ExchangeRateService — tier 2: Supabase cache', () => {
  it('returns the cached rate with its cachedAt timestamp when the API is unavailable', async () => {
    const chain = mockCacheTable();
    chain.maybeSingle.mockResolvedValue({
      data:  { rate: '1.10', updated_at: '2026-07-01T12:00:00.000Z' },
      error: null,
    });
    supabase.from.mockReturnValue(chain);
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false });

    const result = await (new ExchangeRateService()).getRate('EUR', 'USD');

    expect(result.rate).toBe(1.10);
    expect(result.source).toBe('cached');
    expect(result.cachedAt).toEqual(new Date('2026-07-01T12:00:00.000Z'));
  });

  it('falls through to tier 3 when the cache has no row for this pair', async () => {
    const chain = mockCacheTable();
    chain.maybeSingle.mockResolvedValue({ data: null, error: null });
    supabase.from.mockReturnValue(chain);
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false });

    const result = await (new ExchangeRateService()).getRate('EUR', 'USD');

    expect(result.source).toBe('approximate');
    expect(result.rate).toBe(1.08);
  });

  it('falls through to tier 3 when the cache read itself throws', async () => {
    const chain = mockCacheTable();
    chain.maybeSingle.mockRejectedValue(new Error('connection refused'));
    supabase.from.mockReturnValue(chain);
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false });

    const result = await (new ExchangeRateService()).getRate('EUR', 'USD');

    expect(result.source).toBe('approximate');
    expect(result.rate).toBe(1.08);
  });
});

describe('ExchangeRateService — tier 3: hardcoded approximate rates', () => {
  it('returns an approximate rate for a known pair when live and cache both fail', async () => {
    const chain = mockCacheTable();
    chain.maybeSingle.mockResolvedValue({ data: null, error: null });
    supabase.from.mockReturnValue(chain);
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false });

    const result = await (new ExchangeRateService()).getRate('GBP', 'JPY');

    expect(result).toEqual({ rate: 187.9, source: 'approximate' });
  });

  it('throws when no rate exists at any tier for the given pair', async () => {
    const chain = mockCacheTable();
    chain.maybeSingle.mockResolvedValue({ data: null, error: null });
    supabase.from.mockReturnValue(chain);
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false });

    await expect((new ExchangeRateService()).getRate('EUR', 'XYZ')).rejects.toThrow(
      'No exchange rate available for EUR→XYZ',
    );
  });
});
