import type { SplitRequestStatus } from './SplitRequest';

export interface ReportSplitEntry {
  userId: string;
  displayName: string;
  amountOwedCents: number;
}

export interface ReportExpenseEntry {
  id: string;
  description: string;
  totalAmountCents: number;
  currency: string;
  payerName: string;
  createdAt: Date;
  splits: ReportSplitEntry[];
  lineItems?: { description: string; amountCents: number; assignedNames: string[] }[];
  receiptUrl: string | null;
  // Group reports only: set when this expense came from one of the group's
  // trips rather than being logged directly on the group, so the report can
  // show the trip as its own heading instead of dumping every expense into
  // one flat, undifferentiated list.
  tripName?: string;
}

// A pairwise net balance plus its status — 'outstanding' means debt exists
// with no payment attempt on record; any SplitRequestStatus means the most
// recent recorded payment attempt for that pair carries that status. This
// mirrors useSettlement's EnrichedSettlement.latestRequest, since per-split
// amountPaidCents/settledAt are legacy fields no longer updated by the
// current ledger model (recordPayment appends SplitRequest rows, it never
// flips a Split) — the SplitRequest ledger is the only live source of truth
// for "has this been paid".
export interface ReportSettlementEntry {
  fromDisplayName: string;
  toDisplayName: string;
  amountCents: number;
  currency: string;
  status: 'outstanding' | SplitRequestStatus;
}

export interface ReportData {
  title: string;
  subtitle: string;
  currency: string;
  expenses: ReportExpenseEntry[];
  settlements: ReportSettlementEntry[];
  generatedAt: Date;
}
