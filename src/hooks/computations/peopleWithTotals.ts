import type { TripMember } from '../../core/models/TripMember';
import type { Expense } from '../../core/models/Expense';
import { computeSplitTotals } from './splitTotals';

export interface MemberWithTotal extends TripMember {
  grandTotalCents: number;
  grandTotalDisplay: string;
}

/**
 * Decorates each TripMember with their computed grand total across all expenses.
 * Delegates per-person math to computeSplitTotals.
 * Pure function with no side effects — safe to call in any context.
 */
export function computePeopleWithTotals(
  members: TripMember[],
  expenses: Expense[],
  currency: string,
): MemberWithTotal[] {
  return members.map((member) => {
    const totals = computeSplitTotals(member.userId, expenses, currency);
    return {
      ...member,
      grandTotalCents: totals.grandTotalCents,
      grandTotalDisplay: totals.grandTotalDisplay,
    };
  });
}
