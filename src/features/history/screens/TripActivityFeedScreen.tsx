import React from 'react';
import { useLocalSearchParams, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTripSessionStore } from '../../../core/di/ServiceContext';
import { ActivityFeedList } from '../components/ActivityFeedList';
import { useTripActivityFeed } from '../hooks/useTripActivityFeed';

export function TripActivityFeedScreen() {
  const { t } = useTranslation();
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const groups = useTripSessionStore(s => s.groups);
  const trips  = useTripSessionStore(s => s.trips);
  const { events, loading, hasMore, loadMore, error } = useTripActivityFeed(tripId ?? '');

  return (
    <>
      <Stack.Screen options={{ title: t('history.title') }} />
      <ActivityFeedList
        events={events}
        groups={groups}
        trips={trips}
        loading={loading}
        hasMore={hasMore}
        loadMore={loadMore}
        error={error}
      />
    </>
  );
}
