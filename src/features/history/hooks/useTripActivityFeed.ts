import { useCallback } from 'react';
import { useService } from '../../../core/di/ServiceContext';
import { ACTIVITY_LOG } from '../../../core/di/tokens';
import { usePaginatedActivityFeed } from './usePaginatedActivityFeed';
import type { PaginatedActivityFeed } from './usePaginatedActivityFeed';
import type { ActivityFeedQuery } from '../../../core/interfaces/IActivityLogRepository';

export function useTripActivityFeed(tripId: string): PaginatedActivityFeed {
  const activityLog = useService(ACTIVITY_LOG);
  const fetchPage = useCallback(
    (query: ActivityFeedQuery) => activityLog.getEventsForTrip(tripId, query),
    [activityLog, tripId],
  );
  return usePaginatedActivityFeed(fetchPage);
}
