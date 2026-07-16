import { calculateSettlements } from '../../../core/logic/settlement';
import type { LedgerPayment } from '../../../core/logic/settlement';
import { enrichSettlements } from './enrichSettlements';
import { buildReportExpenseEntries } from './buildReportExpenseEntries';
import type { Trip } from '../../../core/models/Trip';
import type { Expense } from '../../../core/models/Expense';
import type { SplitRequest } from '../../../core/models/SplitRequest';
import type { ReportData } from '../../../core/models/Report';
import type { IReceiptStorage } from '../../../core/interfaces/IReceiptStorage';

export async function buildTripReportData(
  trip: Trip,
  expenses: Expense[],
  splitRequests: SplitRequest[],
  receiptStorage: IReceiptStorage,
): Promise<ReportData> {
  const completedPayments: LedgerPayment[] = splitRequests
    .filter(r => r.status === 'paid' || r.status === 'completed')
    .map(r => ({
      payerUserId: r.payerUserId,
      payeeUserId: r.requesterUserId,
      amountCents: r.amountCents,
      currency:    r.currency,
    }));

  const rawSettlements = calculateSettlements(trip.members, expenses, completedPayments);
  const settlements    = enrichSettlements(rawSettlements, trip.members, splitRequests);
  const expenseEntries = await buildReportExpenseEntries(expenses, trip.members, receiptStorage);

  return {
    title:       trip.name,
    subtitle:    'Full trip report — all expenses',
    currency:    trip.currency,
    expenses:    expenseEntries,
    settlements,
    generatedAt: new Date(),
  };
}
