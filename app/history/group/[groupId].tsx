import React from 'react';
import { ErrorBoundary } from '../../../src/components/ErrorBoundary';
import { GroupActivityFeedScreen } from '../../../src/features/history/screens/GroupActivityFeedScreen';

export default function GroupHistoryRoute() {
  return (
    <ErrorBoundary>
      <GroupActivityFeedScreen />
    </ErrorBoundary>
  );
}
