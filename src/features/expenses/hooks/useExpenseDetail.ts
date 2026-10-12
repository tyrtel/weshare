import { useState, useCallback, useEffect } from 'react';
import { useService, useTripSessionStore } from '../../../core/di/ServiceContext';
import { EXPENSE_REPO } from '../../../core/di/tokens';
import { bucket, type CacheBucket } from '../../../core/logic/cacheFreshness';
import { useCacheRevalidation } from '../../../hooks/useCacheRevalidation';
import { isOk } from '../../../core/types/Result';
import type { ITripSessionStore } from '../../../core/interfaces/ITripSessionStore';
import type { Expense } from '../../../core/models/Expense';
import type { AppError } from '../../../core/types/AppError';

interface FetchedExpense {
  expenseId: string;
  expense: Expense | null;
  error: AppError | null;
}

function findCached(s: ITripSessionStore, expenseId: string): Expense | undefined {
  for (const list of Object.values(s.expenses)) {
    const hit = list.find(e => e.id === expenseId);
    if (hit) return hit;
  }
  for (const list of Object.values(s.groupExpenses)) {
    const hit = list.find(e => e.id === expenseId);
    if (hit) return hit;
  }
  return undefined;
}

function parentBucket(e: Expense): CacheBucket[] {
  if (e.groupId) return [bucket.group(e.groupId)];
  if (e.tripId) return [bucket.trip(e.tripId)];
  return [];
}

export function useExpenseDetail(expenseId: string) {
  const expenseRepo = useService(EXPENSE_REPO);

  const cached   = useTripSessionStore((s) => findCached(s, expenseId));
  const inStore  = cached !== undefined;
  const [fetched, setFetched] = useState<FetchedExpense | null>(null);
  const current  = fetched?.expenseId === expenseId ? fetched : null;

  const fetchExpense = useCallback(
    () => expenseRepo.getExpense(expenseId).then(result => setFetched(isOk(result)
      ? { expenseId, expense: result.value, error: null }
      : { expenseId, expense: null, error: result.error })),
    [expenseRepo, expenseId],
  );

  // An expense opened from somewhere its trip/group was never loaded (deep
  // link, activity feed) isn't in the cache — fetch it on its own.
  useEffect(() => {
    if (!inStore) void fetchExpense();
  }, [inStore, fetchExpense]);

  const { refresh } = useCacheRevalidation(cached ? parentBucket(cached) : []);

  const refetch = useCallback(
    () => (inStore ? refresh() : fetchExpense()),
    [inStore, refresh, fetchExpense],
  );

  const expense = cached ?? current?.expense ?? null;
  const error   = inStore ? null : current?.error ?? null;

  return { expense, loading: !expense && !error, error, refetch };
}
