import type { Split } from './Split';

// OCR stub: when OCR ships, line items populate this field and split
// calculation switches from whole-bill to item-level. The Split model
// and settlement algorithm are unaffected — no migration needed.
export interface ExpenseLineItem {
  id: string;
  description: string;
  amountCents: number;
  assignedUserIds: string[];
}

export type RateSource = 'live' | 'cached' | 'approximate';

export interface OriginalAmount {
  amountCents:  number;
  currency:     string;
  exchangeRate: number;
  source:       RateSource;
}

export interface ExpenseMetadata {
  notes?: string;
  receiptUrl?: string;
  lineItems?: ExpenseLineItem[];
  category?: string;
  originalAmount?: OriginalAmount;
}

export interface Expense {
  id: string;
  tripId?: string;        // set for trip expenses; absent for group-level expenses
  groupId?: string;       // set for group-level expenses; absent for trip expenses
  description: string;
  totalAmountCents: number; // integer cents — never floats; 14800 = €148.00
  currency: string;
  paidByUserId: string;
  createdAt: Date;
  settledAt: Date | null; // group expenses only — null = active; Date = settled/off main view
  splits: Split[];
  metadata: ExpenseMetadata;
  recurringExpenseId?: string; // set when spawned from a recurring_expenses template
}
