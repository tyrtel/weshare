import { useTripSessionStore } from '../../../core/di/ServiceContext';
import { bucket } from '../../../core/logic/cacheFreshness';
import { useCacheRevalidation } from '../../../hooks/useCacheRevalidation';
import type { RecurringExpense } from '../../../core/models/RecurringExpense';

const EMPTY: RecurringExpense[] = [];

export function useRecurringExpenses(groupId: string) {
  const items          = useTripSessionStore(s => s.recurringExpenses[groupId]);
  const missing        = useTripSessionStore(s => s.fetchedAt[bucket.recurring(groupId)] === undefined);
  const hydrationError = useTripSessionStore(s => s.hydrationError);
  const { loading } = useCacheRevalidation([bucket.recurring(groupId)]);

  return { recurringExpenses: items ?? EMPTY, loading, error: missing && !loading ? hydrationError : null };
}
