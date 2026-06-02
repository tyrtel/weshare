import React from 'react';
import { ErrorBoundary } from '../../src/components/ErrorBoundary';
import { TripDetailScreen } from '../../src/features/trips/screens/TripDetailScreen';

export default function TripDetailRoute() {
  return (
    <ErrorBoundary>
      <TripDetailScreen />
    </ErrorBoundary>
  );
}
