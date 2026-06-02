import { formatCurrency } from '../../core/utils/formatCurrency';
import type { Expense } from '../../core/models/Expense';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SplitTotals {
  foodTotalCents: number;
  taxShareCents: number;     // always 0 until ExpenseMetadata gains explicit rate fields
  serviceShareCents: number; // always 0 until ExpenseMetadata gains explicit rate fields
  grandTotalCents: number;   // foodTotal + taxShare + serviceShare
  currency: string;
  foodTotalDisplay: string;
  taxShareDisplay: string;
  serviceShareDisplay: string;
  grandTotalDisplay: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export { formatCurrency as formatCents };

// ---------------------------------------------------------------------------
// Pure computation
// ---------------------------------------------------------------------------

/**
 * Computes split totals for one person across a list of expenses.
 *
 * All amounts are integer cents. Tax and service charges are not tracked
 * separately in the current model — they are embedded in each expense's
 * totalAmountCents and therefore already reflected in split.amountOwedCents.
 * Both return 0 and grandTotal === foodTotal until the model is extended.
 *
 * Settled splits (split.settledAt set) ARE included in the total because
 * foodTotal represents what the person owes for their share of all expenses,
 * not what is still outstanding. The settlement screen handles outstanding debt.
 */
export function computeSplitTotals(
  personId: string,
  expenses: Expense[],
  currency: string,
): SplitTotals {
  let foodTotalCents = 0;

  for (const expense of expenses) {
    for (const split of expense.splits) {
      if (split.userId === personId) {
        foodTotalCents += split.amountOwedCents;
      }
    }
  }

  const taxShareCents = 0;
  const serviceShareCents = 0;
  const grandTotalCents = foodTotalCents + taxShareCents + serviceShareCents;

  return {
    foodTotalCents,
    taxShareCents,
    serviceShareCents,
    grandTotalCents,
    currency,
    foodTotalDisplay: formatCurrency(foodTotalCents, currency),
    taxShareDisplay: formatCurrency(taxShareCents, currency),
    serviceShareDisplay: formatCurrency(serviceShareCents, currency),
    grandTotalDisplay: formatCurrency(grandTotalCents, currency),
  };
}
