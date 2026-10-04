import { useCallback } from 'react';
import { useService } from '../../../core/di/ServiceContext';
import { ACTIVITY_LOG } from '../../../core/di/tokens';
import { useTrips } from '../../trips/hooks/useTrips';
import { useGroups } from '../../groups/hooks/useGroups';
import { usePaginatedActivityFeed } from './usePaginatedActivityFeed';
import { ok } from '../../../core/types/Result';
import type { ActivityFeedQuery } from '../../../core/interfaces/IActivityLogRepository';

/**
 * Global History tab feed. The merge across every group/trip the user
 * belongs to, the sort, and the cursor pagination all happen in one query
 * (IActivityLogRepository.getEventsForUser) — Postgres does the union via
 * the same RLS predicate that already scopes reads on activity_events, not
 * a client-side fan-out over N per-group/per-trip requests.
 */
export function useActivityFeed() {
  const activityLog = useService(ACTIVITY_LOG);
  const { trips, loading: tripsLoading } = useTrips();
  const { groups, loading: groupsLoading } = useGroups();
  const sourcesReady = !tripsLoading && !groupsLoading;

  const groupIds = groups.map(g => g.id);
  const tripIds  = trips.map(t => t.id);
  // Stable string keys standing in for the arrays above so fetchPage only
  // gets a new identity when membership actually changes.
  const groupIdsKey = groupIds.join(',');
  const tripIdsKey  = tripIds.join(',');

  const fetchPage = useCallback(
    (query: ActivityFeedQuery) => {
      if (!sourcesReady) return Promise.resolve(ok({ events: [], nextCursor: null }));
      return activityLog.getEventsForUser({ groupIds, tripIds }, query);
    },
    // groupIds/tripIds are recreated every render; groupIdsKey/tripIdsKey
    // are what actually gate re-fetching.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activityLog, groupIdsKey, tripIdsKey, sourcesReady],
  );

  const feed = usePaginatedActivityFeed(fetchPage);
  return { ...feed, loading: feed.loading || !sourcesReady };
}
