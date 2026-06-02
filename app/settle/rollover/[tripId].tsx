import React from 'react';
import { ErrorBoundary } from '../../../src/components/ErrorBoundary';
import { RolloverScreen } from '../../../src/features/settlement/screens/RolloverScreen';

export default function RolloverRoute() {
  return (
    <ErrorBoundary>
      <RolloverScreen />
    </ErrorBoundary>
  );
}
