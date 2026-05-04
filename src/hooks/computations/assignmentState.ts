import type { Expense } from '../../core/models/Expense';

export interface AssignmentDerived {
  /** Map of expenseId → userIds who have a split on that expense. */
  assignments: Record<string, string[]>;
  /** Expenses that have zero splits — no one has been assigned yet. */
  unassignedExpenses: Expense[];
}

/**
 * Derives the assignment map and unassigned expense list from a flat expense array.
 * Pure function with no side effects — safe to call in any context.
 */
export function deriveAssignments(expenses: Expense[]): AssignmentDerived {
  const assignments: Record<string, string[]> = {};
  const unassignedExpenses: Expense[] = [];

  for (const expense of expenses) {
    const userIds = expense.splits.map((s) => s.userId);
    assignments[expense.id] = userIds;
    if (userIds.length === 0) {
      unassignedExpenses.push(expense);
    }
  }

  return { assignments, unassignedExpenses };
}
