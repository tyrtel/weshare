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
