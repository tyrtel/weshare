import { calculateSettlements } from '../../../core/logic/settlement';
import type { LedgerPayment } from '../../../core/logic/settlement';
import { enrichSettlements } from './enrichSettlements';
import { buildReportExpenseEntries } from './buildReportExpenseEntries';
import type { Group } from '../../../core/models/Group';
import type { Trip } from '../../../core/models/Trip';
import type { Expense } from '../../../core/models/Expense';
import type { SplitRequest } from '../../../core/models/SplitRequest';
import type { ReportData } from '../../../core/models/Report';
import type { IReceiptStorage } from '../../../core/interfaces/IReceiptStorage';

function isWithinMonth(date: Date, month: Date): boolean {
  return date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth();
}

// `allExpenses`/`allSplitRequests` cover every trip belonging to the group
// plus its own direct expenses (the caller merges those — see
// useGroupDetail's groupExpenses + tripExpenses, which already track this
// split). Both the itemized list AND the settlement summary are filtered to
// `month` here: balances are a monthly statement for this report, not the
// group's ongoing running total (a deliberate choice — see the design
// discussion this was built from).
export async function buildGroupReportData(
  group: Group,
  allExpenses: Expense[],
  allSplitRequests: SplitRequest[],
  month: Date,
  receiptStorage: IReceiptStorage,
  groupTrips: Trip[] = [],
): Promise<ReportData> {
  const monthExpenses = allExpenses.filter(e => isWithinMonth(e.createdAt, month));
  const monthRequests = allSplitRequests.filter(r => isWithinMonth(r.createdAt, month));

  const completedPayments: LedgerPayment[] = monthRequests
    .filter(r => r.status === 'paid' || r.status === 'completed')
    .map(r => ({
      payerUserId: r.payerUserId,
      payeeUserId: r.requesterUserId,
      amountCents: r.amountCents,
      currency:    r.currency,
    }));

  // calculateSettlements/computeMemberNetBalances are typed against
  // TripMember, not GroupMember — same nominal mismatch computeGroupBalances
  // already works around by passing minimal stubs. Only userId is actually
  // used by the algorithm; enrichSettlements below does the real
  // displayName lookup against group.members directly.
  const memberStubs = group.members.map(m => ({
    userId: m.userId, tripId: '', displayName: '', isGuest: false, joinedAt: new Date(),
  }));
  const rawSettlements = calculateSettlements(memberStubs, monthExpenses, completedPayments);
  const settlements    = enrichSettlements(rawSettlements, group.members, monthRequests);

  const tripNameById = new Map(groupTrips.map(t => [t.id, t.name]));
  const tripNameForExpense = (expense: Expense) => expense.tripId ? tripNameById.get(expense.tripId) : undefined;
  const expenseEntries = await buildReportExpenseEntries(monthExpenses, group.members, receiptStorage, tripNameForExpense);

  const monthLabel = month.toLocaleDateString(undefined, { year: 'numeric', month: 'long' });

  return {
    title:       group.name,
    subtitle:    `${monthLabel} activity report`,
    currency:    group.currency,
    expenses:    expenseEntries,
    settlements,
    generatedAt: new Date(),
  };
}
