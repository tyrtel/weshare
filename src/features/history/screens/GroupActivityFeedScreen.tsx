import React from 'react';
import { useLocalSearchParams, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTripSessionStore } from '../../../core/di/ServiceContext';
import { ActivityFeedList } from '../components/ActivityFeedList';
import { useGroupActivityFeed } from '../hooks/useGroupActivityFeed';

export function GroupActivityFeedScreen() {
  const { t } = useTranslation();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const groups = useTripSessionStore(s => s.groups);
  const trips  = useTripSessionStore(s => s.trips);
  const { events, loading, hasMore, loadMore, error } = useGroupActivityFeed(groupId ?? '');

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
