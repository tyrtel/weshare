import { useState, useEffect, useCallback } from 'react';
import { useService } from '../../../core/di/ServiceContext';
import { EXCHANGE_RATE } from '../../../core/di/tokens';
import type { RateResult } from '../../../core/interfaces/IExchangeRateService';

export interface UseCurrencyRateReturn {
  result:   RateResult | null;
  loading:  boolean;
  error:    string | null;
  refresh:  () => void;
}

export function useCurrencyRate(from: string, to: string): UseCurrencyRateReturn {
  const service = useService(EXCHANGE_RATE);
  const [result,  setResult]  = useState<RateResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (from === to) {
      setResult({ rate: 1, source: 'live' });
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await service.getRate(from, to);
      setResult(r);
    } catch {
      setError('Rate unavailable');
    } finally {
      setLoading(false);
    }
  }, [service, from, to]);

  useEffect(() => { void fetch(); }, [fetch]);

  return { result, loading, error, refresh: fetch };
}
