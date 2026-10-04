import { useState, useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { isOk } from '../../../core/types/Result';
import type { Result } from '../../../core/types/Result';
import type { ActivityFeedQuery, ActivityFeedPage } from '../../../core/interfaces/IActivityLogRepository';
import type { ActivityEvent } from '../../../core/models/ActivityEvent';
import type { AppError } from '../../../core/types/AppError';

export interface PaginatedActivityFeed {
  events:      ActivityEvent[];
  loading:     boolean;
  loadingMore: boolean;
  hasMore:     boolean;
  loadMore:    () => void;
  error:       AppError | null;
}

export type FetchActivityPage = (query: ActivityFeedQuery) => Promise<Result<ActivityFeedPage, AppError>>;

/**
 * Shared cursor-pagination logic behind useGroupActivityFeed and
 * useTripActivityFeed — identical except for which repository method backs
 * `fetchPage`. `fetchPage` must be stable (wrap it in useCallback at the
 * call site) or every render will be treated as a fresh scope.
 */
export function usePaginatedActivityFeed(fetchPage: FetchActivityPage): PaginatedActivityFeed {
  const [events, setEvents]           = useState<ActivityEvent[]>([]);
  const [cursor, setCursor]           = useState<Date | null>(null);
  const [hasMore, setHasMore]         = useState(true);
  const [loading, setLoading]         = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError]             = useState<AppError | null>(null);
  const loadingMoreRef = useRef(false);
  // Bumped on every scope/focus change so a slow in-flight request can't
  // overwrite state after a newer load has started.
  const generationRef = useRef(0);

  const loadFirstPage = useCallback(() => {
    const generation = ++generationRef.current;
    setLoading(true);
    setError(null);
    fetchPage({}).then(result => {
      if (generationRef.current !== generation) return;
      if (isOk(result)) {
        setEvents(result.value.events);
        setCursor(result.value.nextCursor);
        setHasMore(result.value.nextCursor !== null);
      } else {
        setError(result.error);
      }
      setLoading(false);
    });
  }, [fetchPage]);

  useFocusEffect(
    useCallback(() => { loadFirstPage(); }, [loadFirstPage]),
  );

  const loadMore = useCallback(() => {
    if (!hasMore || loadingMoreRef.current || !cursor) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    fetchPage({ before: cursor }).then(result => {
      if (isOk(result)) {
        setEvents(prev => [...prev, ...result.value.events]);
        setCursor(result.value.nextCursor);
        setHasMore(result.value.nextCursor !== null);
      } else {
        setError(result.error);
      }
      loadingMoreRef.current = false;
      setLoadingMore(false);
    });
  }, [hasMore, cursor, fetchPage]);

  return { events, loading, loadingMore, hasMore, loadMore, error };
}
