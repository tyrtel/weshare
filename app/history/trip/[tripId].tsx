import React from 'react';
import { ErrorBoundary } from '../../../src/components/ErrorBoundary';
import { TripActivityFeedScreen } from '../../../src/features/history/screens/TripActivityFeedScreen';

export default function TripHistoryRoute() {
  return (
    <ErrorBoundary>
      <TripActivityFeedScreen />
    </ErrorBoundary>
  );
}
