export interface ChainResult {
  data: unknown;
  error: null | { message: string; code?: string };
}

/**
 * Build a chainable Supabase query mock that resolves with `result` at the end.
 * Every chained method call (`.select()`, `.eq()`, ...) returns the same proxy;
 * awaiting the chain itself, or calling `.single()`/`.maybeSingle()`, resolves
 * to `result` — so callers don't need to know how deep a given query chains.
 */
export function mockChain(result: ChainResult) {
  const terminal = jest.fn().mockResolvedValue(result);
  const chain: Record<string, unknown> = {};
  const asyncChain = new Proxy(chain, {
    get(_target, prop: string) {
      if (prop === 'then') return (res: unknown, rej: unknown) => terminal().then(res, rej);
      if (prop === 'catch') return (fn: unknown) => terminal().catch(fn);
      if (prop === 'finally') return (fn: unknown) => terminal().finally(fn);
      if (['single', 'maybeSingle'].includes(prop)) return terminal;
      return () => asyncChain;
    },
  });
  return asyncChain;
}
