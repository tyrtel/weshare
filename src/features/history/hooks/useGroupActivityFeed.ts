import { useCallback } from 'react';
import { useService } from '../../../core/di/ServiceContext';
import { ACTIVITY_LOG } from '../../../core/di/tokens';
import { usePaginatedActivityFeed } from './usePaginatedActivityFeed';
import type { PaginatedActivityFeed } from './usePaginatedActivityFeed';
import type { ActivityFeedQuery } from '../../../core/interfaces/IActivityLogRepository';

export function useGroupActivityFeed(groupId: string): PaginatedActivityFeed {
  const activityLog = useService(ACTIVITY_LOG);
  const fetchPage = useCallback(
    (query: ActivityFeedQuery) => activityLog.getEventsForGroup(groupId, query),
    [activityLog, groupId],
  );
  return usePaginatedActivityFeed(fetchPage);
}
