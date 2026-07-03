import { useState, useCallback } from 'react';
import { useService } from '../../../core/di/ServiceContext';
import { EXPENSE_REPO, TRIP_STORE, NOTIFICATION_SERVICE } from '../../../core/di/tokens';
import { isOk } from '../../../core/types/Result';
import type { AppError } from '../../../core/types/AppError';

export function useSettleGroupExpense() {
  const expenseRepo         = useService(EXPENSE_REPO);
  const storeApi            = useService(TRIP_STORE);
  const notificationService = useService(NOTIFICATION_SERVICE);

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<AppError | null>(null);

  const settleGroupExpense = useCallback(
    async (expenseId: string, groupId: string): Promise<boolean> => {
      setError(null);
      setLoading(true);
      try {
        const settledAt = new Date();
        const result    = await expenseRepo.settleExpense(expenseId, settledAt);
        if (!isOk(result)) { setError(result.error); return false; }
        storeApi.getState().settleGroupExpenseInStore(expenseId, groupId, settledAt);

        // Fire-and-forget: notify the expense creditor that the debt was settled.
        const settled = (storeApi.getState().groupExpenses[groupId] ?? []).find(e => e.id === expenseId);
        const group   = storeApi.getState().groups.find(g => g.id === groupId);
        if (settled?.paidByUserId) {
          notificationService.enqueue({
            userId:    settled.paidByUserId,
            channel:   'push',
            eventType: 'expense_settled',
            payload: {
              userId: settled.paidByUserId,
              title:  group?.name ?? 'WeShare',
              body:   `"${settled.description}" in ${group?.name ?? 'your group'} was settled.`,
            },
          }).catch(() => {});
        }

        return true;
      } catch (e) {
        setError({ kind: 'NetworkError', message: e instanceof Error ? e.message : 'Unexpected error' });
        return false;
      } finally {
        setLoading(false);
      }
    },
    [expenseRepo, storeApi, notificationService],
  );

  return { settleGroupExpense, loading, error };
}
