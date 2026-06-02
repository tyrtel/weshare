import React from 'react';
import { ErrorBoundary } from '../../src/components/ErrorBoundary';
import { ClosedTripsScreen } from '../../src/features/trips/screens/ClosedTripsScreen';

export default function ClosedTripsRoute() {
  return (
    <ErrorBoundary>
      <ClosedTripsScreen />
    </ErrorBoundary>
  );
}
