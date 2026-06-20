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
  tripId: string;
  description: string;
  totalAmountCents: number; // integer cents — never floats; 14800 = €148.00
  currency: string;
  paidByUserId: string;
  createdAt: Date;
  splits: Split[];
  metadata: ExpenseMetadata;
}
