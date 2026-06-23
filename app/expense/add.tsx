import React from 'react';
import { ErrorBoundary } from '../../src/components/ErrorBoundary';
import { ExpenseFormScreen } from '../../src/features/expenses/screens/ExpenseFormScreen';

export default function AddExpenseRoute() {
  return (
    <ErrorBoundary>
      <ExpenseFormScreen />
    </ErrorBoundary>
  );
}
