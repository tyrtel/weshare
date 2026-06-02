/**
 * Format an integer cent amount as a localised currency string.
 * Uses the device locale so symbols and separators match the user's region.
 *
 * @param cents    Amount in the smallest currency unit (e.g. 2500 → €25.00)
 * @param currency ISO 4217 currency code (e.g. 'EUR', 'USD', 'GBP')
 */
export function formatCurrency(cents: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style:                 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}
