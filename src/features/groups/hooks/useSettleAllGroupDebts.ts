import { useState, useCallback } from 'react';
import { useService } from '../../../core/di/ServiceContext';
import { EXPENSE_REPO, TRIP_STORE } from '../../../core/di/tokens';
import { isOk } from '../../../core/types/Result';
import type { AppError } from '../../../core/types/AppError';

export function useSettleAllGroupDebts(groupId: string) {
  const expenseRepo = useService(EXPENSE_REPO);
  const storeApi    = useService(TRIP_STORE);

  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<AppError | null>(null);

  const settleAll = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    setError(null);

    try {
      const state = storeApi.getState();
      const now   = new Date();

      // ── Settle all active group-level expenses ────────────────────────────────
      const groupExpenses        = state.groupExpenses[groupId] ?? [];
      const activeGroupExpenses  = groupExpenses.filter(e => !e.settledAt);

      const expenseResults = await Promise.all(
        activeGroupExpenses.map(e => expenseRepo.settleExpense(e.id, now)),
      );
      const expenseError = expenseResults.find(r => !isOk(r));
      if (expenseError && !isOk(expenseError)) {
        setError(expenseError.error);
        return false;
      }
      for (const e of activeGroupExpenses) {
        state.settleGroupExpenseInStore(e.id, groupId, now);
      }

      // ── Close all active trips in this group ──────────────────────────────────
      // Closing a trip excludes its expenses from the group balance calculation,
      // dropping all associated debts to zero without touching individual splits.
      const activeTrips = state.trips.filter(
        t => t.groupId === groupId && t.status !== 'closed',
      );

      const tripResults = await Promise.all(
        activeTrips.map(t => storeApi.getState().setTripStatus(t.id, 'closed')),
      );
      const tripError = tripResults.find(r => !isOk(r));
      if (tripError && !isOk(tripError)) {
        setError(tripError.error);
        return false;
      }

      return true;
    } catch (e) {
      setError({ kind: 'NetworkError', message: e instanceof Error ? e.message : 'Unexpected error' });
      return false;
    } finally {
      setLoading(false);
    }
  }, [groupId, expenseRepo, storeApi]);

  return { settleAll, loading, error };
}
