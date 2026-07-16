import type { Expense } from '../../../core/models/Expense';
import type { ReportExpenseEntry } from '../../../core/models/Report';
import type { IReceiptStorage } from '../../../core/interfaces/IReceiptStorage';

interface NamedMember {
  userId: string;
  displayName: string;
}

// Resolves a signed URL for every expense's receipt (if any) up front, in
// parallel, before building the report — expo-print's renderer needs a
// fetchable <img src> at render time, and the resulting PDF rasterizes the
// image into itself, so the 1-hour signed-URL TTL only needs to survive the
// few seconds of rendering, not however long the user keeps the file.
export async function buildReportExpenseEntries(
  expenses: Expense[],
  members: NamedMember[],
  receiptStorage: IReceiptStorage,
  // Group reports pass this to label which trip (if any) an expense came
  // from; trip reports never need it (no sub-trips of a trip).
  tripNameForExpense?: (expense: Expense) => string | undefined,
): Promise<ReportExpenseEntry[]> {
  const nameMap = new Map(members.map(m => [m.userId, m.displayName]));
  const displayName = (userId: string) => nameMap.get(userId) ?? userId;

  const receiptUrls = await Promise.all(
    expenses.map(e =>
      e.metadata.receiptUrl
        ? receiptStorage.getReceiptUrl(e.metadata.receiptUrl).catch(() => null)
        : Promise.resolve(null),
    ),
  );

  return expenses.map((expense, i) => ({
    id:               expense.id,
    description:      expense.description,
    totalAmountCents: expense.totalAmountCents,
    currency:         expense.currency,
    payerName:        displayName(expense.paidByUserId),
    createdAt:        expense.createdAt,
    splits: expense.splits.map(s => ({
      userId:          s.userId,
      displayName:     displayName(s.userId),
      amountOwedCents: s.amountOwedCents,
    })),
    lineItems: expense.metadata.lineItems?.map(item => ({
      description:   item.description,
      amountCents:   item.amountCents,
      assignedNames: item.assignedUserIds.map(displayName),
    })),
    receiptUrl: receiptUrls[i],
    tripName: tripNameForExpense?.(expense),
  }));
}
