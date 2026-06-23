export interface CurrencyDef {
  code:   string;
  symbol: string;
  name:   string;
}

export const CURRENCIES: CurrencyDef[] = [
  { code: 'EUR', symbol: '€',   name: 'Euro' },
  { code: 'USD', symbol: '$',   name: 'US Dollar' },
  { code: 'GBP', symbol: '£',   name: 'British Pound' },
  { code: 'JPY', symbol: '¥',   name: 'Japanese Yen' },
  { code: 'CAD', symbol: 'CA$', name: 'Canadian Dollar' },
  { code: 'AUD', symbol: 'A$',  name: 'Australian Dollar' },
  { code: 'CHF', symbol: 'Fr',  name: 'Swiss Franc' },
];

export function currencySymbol(code: string): string {
  return CURRENCIES.find(c => c.code === code)?.symbol ?? code;
}

export function currencyLabel(code: string): string {
  const c = CURRENCIES.find(x => x.code === code);
  return c ? `${c.symbol} ${c.code}` : code;
}

// Zero-decimal currencies have no subunit (1 JPY = 1 JPY, not 100 sen).
// Storing or displaying these with ×100 scaling would inflate amounts by 100×
// and cause integer overflow on large values.
const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'IDR', 'ISK', 'HUF', 'CLP', 'XAF', 'XOF', 'XPF']);

/**
 * Returns the multiplier between the major unit and the stored integer unit.
 * 100 for two-decimal currencies (EUR, USD, GBP, …), 1 for zero-decimal (JPY, …).
 */
export function getMinorUnitMultiplier(currency: string): 1 | 100 {
  return ZERO_DECIMAL.has(currency) ? 1 : 100;
}
