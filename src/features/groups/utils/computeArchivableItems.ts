import { computeMemberNetBalances, type LedgerPayment } from '../../../core/logic/settlement';
import type { Expense } from '../../../core/models/Expense';
import type { Trip } from '../../../core/models/Trip';

export interface ArchivableItemsResult {
  archivableExpenseIds: Set<string>;
  archivableTripIds: Set<string>;
}

interface DebtItem {
  key: string; // `${kind}:${id}` — unique across expenses and trips
  dateMs: number;
  amountCents: number; // this member's owed share
}

/**
 * A completed payment nets against a person's total debt, not against any
 * specific expense (see settlement.ts). So "is this expense paid off" can't
 * be read directly off the ledger — it has to be inferred: for each debtor,
 * walk their debt items newest-first and accumulate a running total. Once
 * that running total already covers their current outstanding balance, any
 * item further back must have been fully paid off by an earlier real
 * payment (oldest-debt-first), regardless of which specific item that
 * payment named. An item only counts as archivable once every debtor on it
 * clears that bar — one still-outstanding participant blocks the whole item.
 *
 * A group trip is archived as a whole, not expense-by-expense, so its debt
 * items are rolled up per member into a single entry dated at the trip's
 * most recent expense.
 */
export function computeArchivableItems(
  memberUserIds: string[],
  groupTrips: Trip[],
  tripExpenses: Record<string, Expense[]>,
  groupExpenses: Expense[],
  payments: LedgerPayment[] = [],
): ArchivableItemsResult {
  const members = memberUserIds.map(userId => ({
    userId, tripId: '', displayName: '', isGuest: false, joinedAt: new Date(),
  }));
  const allExpenses = [...groupTrips.flatMap(t => tripExpenses[t.id] ?? []), ...groupExpenses];
  const balanceByUser = new Map(
    computeMemberNetBalances(members, allExpenses, payments).map(b => [b.userId, b.balanceCents]),
  );

  const itemsByMember = new Map<string, DebtItem[]>();
  const addItem = (userId: string, item: DebtItem) => {
    const list = itemsByMember.get(userId);
    if (list) list.push(item);
    else itemsByMember.set(userId, [item]);
  };

  for (const expense of groupExpenses) {
    for (const split of expense.splits) {
      if (split.amountOwedCents <= 0) continue;
      addItem(split.userId, { key: `expense:${expense.id}`, dateMs: expense.createdAt.getTime(), amountCents: split.amountOwedCents });
    }
  }

  for (const trip of groupTrips) {
    const expenses = tripExpenses[trip.id] ?? [];
    const owedByMember = new Map<string, number>();
    let latestMs = trip.createdAt.getTime();
    for (const expense of expenses) {
      latestMs = Math.max(latestMs, expense.createdAt.getTime());
      for (const split of expense.splits) {
        if (split.amountOwedCents <= 0) continue;
        owedByMember.set(split.userId, (owedByMember.get(split.userId) ?? 0) + split.amountOwedCents);
      }
    }
    for (const [userId, amountCents] of owedByMember) {
      addItem(userId, { key: `trip:${trip.id}`, dateMs: latestMs, amountCents });
    }
  }

  const blocked = new Set<string>();
  for (const [userId, items] of itemsByMember) {
    const balance = balanceByUser.get(userId) ?? 0;
    const remainingDebt = balance < 0 ? -balance : 0;

    const newestFirst = [...items].sort((a, b) => b.dateMs - a.dateMs);
    let running = 0;
    for (const item of newestFirst) {
      if (running < remainingDebt) blocked.add(item.key);
      running += item.amountCents;
    }
  }

  const archivableExpenseIds = new Set(groupExpenses.filter(e => !blocked.has(`expense:${e.id}`)).map(e => e.id));
  const archivableTripIds    = new Set(groupTrips.filter(t => !blocked.has(`trip:${t.id}`)).map(t => t.id));

  return { archivableExpenseIds, archivableTripIds };
}
