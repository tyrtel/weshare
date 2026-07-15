import { calculateSettlements, computeMemberNetBalances, type MemberBalance, type LedgerPayment } from '../../../core/logic/settlement';
import type { Settlement } from '../../../core/models/Settlement';
import type { Expense } from '../../../core/models/Expense';
import type { Trip } from '../../../core/models/Trip';

export interface GroupBalanceResult {
  settlements:    Settlement[];
  memberBalances: MemberBalance[];
}

/**
 * Computes the minimal settlement transfers and per-member net balances for a
 * group. Aggregates both trip-level expenses (from trips whose groupId matches)
 * and direct group-level expenses.
 *
 * `payments` is the ledger's credit side — the caller merges completed
 * SplitRequests from both scopes (the group's own, plus every one of its
 * trips') before calling in.
 *
 * Assumes a single shared currency across all collected expenses. Mixed-currency
 * groups are not supported in this iteration and will silently use the currency
 * of the first expense.
 */
export function computeGroupBalances(
  memberUserIds: string[],
  groupTrips: Trip[],
  tripExpenses: Record<string, Expense[]>,
  groupExpenses: Expense[],
  payments: LedgerPayment[] = [],
): GroupBalanceResult {
  // Phase 4c: a trip's or expense's "closed"/"settled" state is purely
  // organizational now — it no longer hides debt. The ledger (expenses minus
  // completed payments) is the only thing that determines what shows up here.
  const allExpenses: Expense[] = [
    ...groupTrips.flatMap(t => tripExpenses[t.id] ?? []),
    ...groupExpenses,
  ];

  const members = memberUserIds.map(userId => ({
    userId,
    tripId:      '',
    displayName: '',
    isGuest:     false,
    joinedAt:    new Date(),
  }));

  return {
    settlements:    calculateSettlements(members, allExpenses, payments),
    memberBalances: computeMemberNetBalances(members, allExpenses, payments),
  };
}

export type { MemberBalance };
