import React from 'react';
import { ErrorBoundary } from '../../src/components/ErrorBoundary';
import { SettlementScreen } from '../../src/features/settlement/screens/SettlementScreen';

export default function SettlementRoute() {
  return (
    <ErrorBoundary>
      <SettlementScreen />
    </ErrorBoundary>
  );
}
