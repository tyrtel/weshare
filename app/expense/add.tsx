import React from 'react';
import { ErrorBoundary } from '../../src/components/ErrorBoundary';
import { AddExpenseScreen } from '../../src/features/expenses/screens/AddExpenseScreen';

export default function AddExpenseRoute() {
  return (
    <ErrorBoundary>
      <AddExpenseScreen />
    </ErrorBoundary>
  );
}
