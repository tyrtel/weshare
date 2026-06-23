import { getMinorUnitMultiplier } from '../constants/currencies';

/**
 * Format an integer minor-unit amount as a localised currency string.
 * Uses the device locale so symbols and separators match the user's region.
 * Decimal places are determined by the currency (2 for EUR/USD/GBP, 0 for JPY, …).
 *
 * @param minorUnits  Amount in the smallest currency unit (2500 → €25.00, 2500 → ¥2500)
 * @param currency    ISO 4217 currency code (e.g. 'EUR', 'JPY')
 */
export function formatCurrency(minorUnits: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style:    'currency',
    currency,
  }).format(minorUnits / getMinorUnitMultiplier(currency));
}
