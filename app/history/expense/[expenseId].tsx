import React from 'react';
import { ErrorBoundary } from '../../../src/components/ErrorBoundary';
import { ExpenseActivityFeedScreen } from '../../../src/features/history/screens/ExpenseActivityFeedScreen';

export default function ExpenseHistoryRoute() {
  return (
    <ErrorBoundary>
      <ExpenseActivityFeedScreen />
    </ErrorBoundary>
  );
}
