import type { TripMember } from '../models/TripMember';
import type { Expense } from '../models/Expense';
import type { Settlement } from '../models/Settlement';

// ── Financial summary ─────────────────────────────────────────────────────────

export type TripFinancialDirection = 'owe' | 'owed' | 'even';

export interface TripFinancialSummary {
  direction: TripFinancialDirection;
  amountCents: number;
}

/**
 * Returns a single-user financial summary for a trip from the perspective of
 * `currentUserId`. Returns `null` when the trip has no expenses yet (so the
 * caller can distinguish "settled" from "nothing recorded").
 */
export function deriveTripFinancialSummary(
  members: TripMember[],
  expenses: Expense[],
  currentUserId: string,
): TripFinancialSummary | null {
  if (expenses.length === 0) return null;

  const settlements = calculateSettlements(members, expenses);

  const owes = settlements
    .filter(s => s.fromUserId === currentUserId)
    .reduce((sum, s) => sum + s.amountCents, 0);

  if (owes > 0) return { direction: 'owe', amountCents: owes };

  const owed = settlements
    .filter(s => s.toUserId === currentUserId)
    .reduce((sum, s) => sum + s.amountCents, 0);

  if (owed > 0) return { direction: 'owed', amountCents: owed };

  return { direction: 'even', amountCents: 0 };
}

// ── Per-member net balance ────────────────────────────────────────────────────

export interface MemberBalance {
  userId: string;
  /** Positive = creditor (others owe them). Negative = debtor (they owe others). */
  balanceCents: number;
}

/**
 * Computes each member's net outstanding balance without producing transfer pairs.
 * Positive balance → owed money. Negative balance → owes money.
 */
export function computeMemberNetBalances(
  members: TripMember[],
  expenses: Expense[],
): MemberBalance[] {
  const map = new Map<string, number>(members.map(m => [m.userId, 0]));

  for (const expense of expenses) {
    for (const split of expense.splits) {
      if (split.settledAt !== undefined) continue;
      const outstanding = split.amountOwedCents - split.amountPaidCents;
      if (outstanding <= 0) continue;
      map.set(expense.paidByUserId, (map.get(expense.paidByUserId) ?? 0) + outstanding);
      map.set(split.userId, (map.get(split.userId) ?? 0) - outstanding);
    }
  }

  return members.map(m => ({ userId: m.userId, balanceCents: map.get(m.userId) ?? 0 }));
}

/**
 * Computes the minimal set of transfers needed to settle all debts in a trip.
 *
 * Step 1 — Net balance per person (integer cents):
 *   For every unsettled split, the payer's balance increases by the outstanding
 *   amount and the split-person's balance decreases by the same. The payer's own
 *   split self-cancels (+N then −N = 0).
 *   Positive balance → owed money (creditor).
 *   Negative balance → owes money (debtor).
 *
 * Step 2 — Greedy debt simplification:
 *   Repeatedly match the largest creditor with the largest debtor. Each
 *   iteration emits at most one transfer and eliminates at least one party,
 *   giving O(n log n) complexity and the minimum number of transactions.
 *
 * Assumptions:
 *  - All amounts are integer cents (never floats).
 *  - All expenses in the trip share the same currency.
 *  - Splits with settledAt set are excluded from outstanding debt.
 */
export function calculateSettlements(
  members: TripMember[],
  expenses: Expense[],
): Settlement[] {
  if (expenses.length === 0 || members.length <= 1) return [];

  const currency = expenses[0].currency;

  // ── Step 1: net balance per member ──────────────────────────────────────────
  const balances = new Map<string, number>();
  for (const member of members) {
    balances.set(member.userId, 0);
  }

  for (const expense of expenses) {
    for (const split of expense.splits) {
      if (split.settledAt !== undefined) continue;

      const outstanding = split.amountOwedCents - split.amountPaidCents;
      if (outstanding <= 0) continue;

      balances.set(
        expense.paidByUserId,
        (balances.get(expense.paidByUserId) ?? 0) + outstanding,
      );
      balances.set(
        split.userId,
        (balances.get(split.userId) ?? 0) - outstanding,
      );
    }
  }

  // ── Step 2: greedy matching ──────────────────────────────────────────────────
  const creditors: Array<{ userId: string; amount: number }> = [];
  const debtors: Array<{ userId: string; amount: number }> = [];

  for (const [userId, balance] of balances) {
    if (balance > 0) creditors.push({ userId, amount: balance });
    else if (balance < 0) debtors.push({ userId, amount: -balance });
  }

  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const settlements: Settlement[] = [];
  let ci = 0;
  let di = 0;

  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci];
    const debtor = debtors[di];
    const amount = Math.min(creditor.amount, debtor.amount);

    if (amount > 0) {
      settlements.push({
        fromUserId: debtor.userId,
        toUserId: creditor.userId,
        amountCents: amount,
        currency,
      });
    }

    creditor.amount -= amount;
    debtor.amount -= amount;

    if (creditor.amount === 0) ci++;
    if (debtor.amount === 0) di++;
  }

  return settlements;
}
