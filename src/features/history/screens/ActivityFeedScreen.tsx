import React from 'react';
import { useTripSessionStore } from '../../../core/di/ServiceContext';
import { ActivityFeedList } from '../components/ActivityFeedList';
import { useActivityFeed } from '../hooks/useActivityFeed';

/** Global History tab — activity across every group and trip the user
 * belongs to. */
export function ActivityFeedScreen() {
  const groups = useTripSessionStore(s => s.groups);
  const trips  = useTripSessionStore(s => s.trips);
  const { events, loading, hasMore, loadMore, error } = useActivityFeed();

  return (
    <ActivityFeedList
      events={events}
      groups={groups}
      trips={trips}
      loading={loading}
      hasMore={hasMore}
      loadMore={loadMore}
      error={error}
    />
  );
}
