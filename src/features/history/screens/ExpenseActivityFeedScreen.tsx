import React from 'react';
import { useLocalSearchParams, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTripSessionStore } from '../../../core/di/ServiceContext';
import { ActivityFeedList } from '../components/ActivityFeedList';
import { useExpenseActivityFeed } from '../hooks/useExpenseActivityFeed';

export function ExpenseActivityFeedScreen() {
  const { t } = useTranslation();
  const { expenseId } = useLocalSearchParams<{ expenseId: string }>();
  const groups = useTripSessionStore(s => s.groups);
  const trips  = useTripSessionStore(s => s.trips);
  const { events, loading, error } = useExpenseActivityFeed(expenseId ?? '');

  return (
    <>
      <Stack.Screen options={{ title: t('history.title') }} />
      <ActivityFeedList
        events={events}
        groups={groups}
        trips={trips}
        loading={loading}
        hasMore={false}
        loadMore={() => {}}
        error={error}
      />
    </>
  );
}
