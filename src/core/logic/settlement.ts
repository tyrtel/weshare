import type { TripMember } from '../models/TripMember';
import type { Expense } from '../models/Expense';
import type { Settlement } from '../models/Settlement';

// ── Ledger payments ───────────────────────────────────────────────────────────
// A completed real-money payment between two people — the credit side of the
// running ledger. Deliberately decoupled from `SplitRequest` (no Stripe/Open
// Banking fields here): callers filter their own SplitRequest[] down to this
// shape before calling in. Not tied to any specific split — a payment reduces
// the payer's overall balance, and any leftover (an overpayment) becomes a
// credit that nets against whatever debt comes next, no allocation needed.

export interface LedgerPayment {
  payerUserId: string;
  payeeUserId: string;
  amountCents: number;
  currency: string;
  /** Optional — only needed by `buildLedgerHistory` below, not by the balance/settlement calculations. */
  id?: string;
  date?: Date;
}

function applyLedgerPayments(balances: Map<string, number>, payments: LedgerPayment[]): void {
  for (const payment of payments) {
    balances.set(payment.payerUserId, (balances.get(payment.payerUserId) ?? 0) + payment.amountCents);
    balances.set(payment.payeeUserId, (balances.get(payment.payeeUserId) ?? 0) - payment.amountCents);
  }
}

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
  payments: LedgerPayment[] = [],
): TripFinancialSummary | null {
  if (expenses.length === 0) return null;

  const settlements = calculateSettlements(members, expenses, payments);

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
 *
 * `payments` is the ledger's credit side — completed real payments, summed in
 * on top of the expense debits. A split's full `amountOwedCents` is always a
 * debit; `Split.amountPaidCents`/`settledAt` are never read here (the ledger
 * of completed payments is the sole source of truth for what's been paid).
 */
export function computeMemberNetBalances(
  members: TripMember[],
  expenses: Expense[],
  payments: LedgerPayment[] = [],
): MemberBalance[] {
  const map = new Map<string, number>(members.map(m => [m.userId, 0]));

  for (const expense of expenses) {
    for (const split of expense.splits) {
      const outstanding = split.amountOwedCents;
      if (outstanding <= 0) continue;
      map.set(expense.paidByUserId, (map.get(expense.paidByUserId) ?? 0) + outstanding);
      map.set(split.userId, (map.get(split.userId) ?? 0) - outstanding);
    }
  }

  applyLedgerPayments(map, payments);

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
 *  - `payments` (completed real payments) are summed in as credits on top of
 *    the expense debits — `Split.amountPaidCents`/`settledAt` are not read;
 *    the ledger of completed payments is the sole source of truth for what's
 *    been paid. Overpayment simply nets to a negative debit (a credit) with
 *    no special handling.
 */
export function calculateSettlements(
  members: TripMember[],
  expenses: Expense[],
  payments: LedgerPayment[] = [],
): Settlement[] {
  if ((expenses.length === 0 && payments.length === 0) || members.length <= 1) return [];

  const currency = expenses[0]?.currency ?? payments[0]?.currency ?? '';

  // ── Step 1: net balance per member ──────────────────────────────────────────
  const balances = new Map<string, number>();
  for (const member of members) {
    balances.set(member.userId, 0);
  }

  for (const expense of expenses) {
    for (const split of expense.splits) {
      const outstanding = split.amountOwedCents;
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

  applyLedgerPayments(balances, payments);

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

// ── Per-pair ledger history ────────────────────────────────────────────────────

export interface LedgerEntry {
  id: string;
  date: Date;
  type: 'expense' | 'payment';
  description: string;
  /** Signed from `fromUserId`'s perspective: positive grows what they owe `toUserId`, negative shrinks it. */
  amountCents: number;
  /** Running total after this entry. Positive = `fromUserId` owes `toUserId`; negative = the reverse. */
  balanceCents: number;
  currency: string;
}

/**
 * Builds a chronological, running-balance history of exactly what passed between
 * two members — every expense either paid, and every completed payment either
 * made, in either direction. This is a two-party view; it isn't guaranteed to
 * reconcile with the n-party greedy-matched `calculateSettlements` output once a
 * third member is involved (e.g. A→B and B→C can net to a direct A→C settlement
 * with no shared expense history between A and C at all) — it exists to explain
 * "how did we get here" for one pair, not to replace the settlement algorithm.
 */
export function buildLedgerHistory(
  fromUserId: string,
  toUserId: string,
  expenses: Expense[],
  payments: LedgerPayment[] = [],
): LedgerEntry[] {
  const unordered: Omit<LedgerEntry, 'balanceCents'>[] = [];

  for (const expense of expenses) {
    if (expense.paidByUserId === toUserId) {
      const split = expense.splits.find(s => s.userId === fromUserId);
      if (split && split.amountOwedCents > 0) {
        unordered.push({
          id: expense.id,
          date: expense.createdAt,
          type: 'expense',
          description: expense.description,
          amountCents: split.amountOwedCents,
          currency: expense.currency,
        });
      }
    } else if (expense.paidByUserId === fromUserId) {
      const split = expense.splits.find(s => s.userId === toUserId);
      if (split && split.amountOwedCents > 0) {
        unordered.push({
          id: expense.id,
          date: expense.createdAt,
          type: 'expense',
          description: expense.description,
          amountCents: -split.amountOwedCents,
          currency: expense.currency,
        });
      }
    }
  }

  for (const payment of payments) {
    const isForward = payment.payerUserId === fromUserId && payment.payeeUserId === toUserId;
    const isReverse = payment.payerUserId === toUserId && payment.payeeUserId === fromUserId;
    if (!isForward && !isReverse) continue;

    unordered.push({
      id: payment.id ?? `${payment.payerUserId}:${payment.payeeUserId}:${payment.amountCents}`,
      date: payment.date ?? new Date(0),
      type: 'payment',
      description: '',
      amountCents: isForward ? -payment.amountCents : payment.amountCents,
      currency: payment.currency,
    });
  }

  unordered.sort((a, b) => a.date.getTime() - b.date.getTime());

  let running = 0;
  return unordered.map(entry => {
    running += entry.amountCents;
    return { ...entry, balanceCents: running };
  });
}
