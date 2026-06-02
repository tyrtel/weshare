import { useTripSessionStore } from '../core/di/ServiceContext';
import { selectExpenses } from '../store/selectors';
import { deriveAssignments } from './computations/assignmentState';
import type { Expense } from '../core/models/Expense';
import { logger } from '../core/utils/logger';

export type { AssignmentDerived } from './computations/assignmentState';
export { deriveAssignments };

export interface AssignmentState {
  assignments: Record<string, string[]>;
  unassignedExpenses: Expense[];
  /**
   * Add a user to an expense's split list.
   * Stub in Phase 3 — wired to store split-mutation actions in Phase 5.
   */
  assignExpense: (expenseId: string, userId: string) => void;
  /**
   * Remove a user from an expense's split list.
   * Stub in Phase 3 — wired to store split-mutation actions in Phase 5.
   */
  unassignExpense: (expenseId: string, userId: string) => void;
}

export function useAssignmentState(tripId: string): AssignmentState {
  const expenses = useTripSessionStore((s) => selectExpenses(s, tripId));
  const { assignments, unassignedExpenses } = deriveAssignments(expenses);

  return {
    assignments,
    unassignedExpenses,
    assignExpense: (_expenseId: string, _userId: string) => {
      logger.warn('assignExpense: not yet implemented — pending Phase 5 split-mutation actions');
    },
    unassignExpense: (_expenseId: string, _userId: string) => {
      logger.warn('unassignExpense: not yet implemented — pending Phase 5 split-mutation actions');
    },
  };
}
