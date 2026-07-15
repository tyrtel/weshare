import React from 'react';
import { screen } from '@testing-library/react-native';
import { mockVectorIconsModule } from '../../../__testUtils__/standardMocks';

jest.mock('@expo/vector-icons', () => mockVectorIconsModule());
jest.mock('expo-router', () => ({
  useLocalSearchParams: jest.fn(),
  Stack: { Screen: () => null },
}));

jest.mock('../hooks/useLedgerHistory', () => ({
  useLedgerHistory: jest.fn(),
}));

import { useLocalSearchParams } from 'expo-router';
import { AuditDetailScreen } from '../screens/AuditDetailScreen';
import { useLedgerHistory } from '../hooks/useLedgerHistory';
import { renderScreen } from '../../../__testUtils__/renderScreen';
import { createTestContainer } from '../../../core/di/testContainer';

const mockParams            = useLocalSearchParams as jest.Mock;
const mockUseLedgerHistory   = useLedgerHistory as jest.Mock;

function render() {
  return renderScreen(<AuditDetailScreen />, createTestContainer());
}

beforeEach(() => {
  mockParams.mockReturnValue({
    tripId: 't1', fromUserId: 'u1', toUserId: 'u2', fromName: 'Alice', toName: 'Bob',
  });
});

const BASE_STATE = {
  entries: [] as unknown[],
  balanceCents: 0,
  currency: 'EUR',
  loading: false,
  error: null,
  settling: false,
  recordPayment: jest.fn(),
  refetch: jest.fn(),
};

describe('AuditDetailScreen', () => {
  it('renders ledger entries with description, amount, and running balance', () => {
    mockUseLedgerHistory.mockReturnValue({
      ...BASE_STATE,
      balanceCents: 1500,
      entries: [
        { id: 'e1', date: new Date('2025-06-01T12:00:00Z'), type: 'expense', description: 'Dinner', amountCents: 2500, balanceCents: 2500, currency: 'EUR' },
        { id: 'p1', date: new Date('2025-06-05T12:00:00Z'), type: 'payment', description: '', amountCents: -1000, balanceCents: 1500, currency: 'EUR' },
      ],
    });

    render();

    expect(screen.getByText('Alice → Bob')).toBeTruthy();
    expect(screen.getByText('Dinner')).toBeTruthy();
    expect(screen.getByText('+€25.00')).toBeTruthy();
    expect(screen.getByText('−€10.00')).toBeTruthy();
  });

  it('shows the empty state when there is no ledger history', () => {
    mockUseLedgerHistory.mockReturnValue({ ...BASE_STATE, entries: [] });

    render();

    expect(screen.getByText('No activity yet.')).toBeTruthy();
  });

  it('shows an error state instead of crashing when the ledger fails to load', () => {
    mockUseLedgerHistory.mockReturnValue({ ...BASE_STATE, entries: [], error: { kind: 'NetworkError', message: 'boom' } });

    render();

    expect(screen.queryByText('No activity yet.')).toBeNull();
    expect(screen.getByText('Could not load ledger history.')).toBeTruthy();
  });

  it('shows the record-payment button and opens the sheet on press', () => {
    const { fireEvent } = require('@testing-library/react-native');
    mockUseLedgerHistory.mockReturnValue({ ...BASE_STATE, balanceCents: 2500 });

    render();
    fireEvent.press(screen.getByTestId('record-payment-button'));

    expect(screen.getByText('Record a payment')).toBeTruthy();
  });

  it('calls recordPayment with the entered amount on confirm', () => {
    const { fireEvent } = require('@testing-library/react-native');
    const recordPayment = jest.fn().mockResolvedValue(undefined);
    mockUseLedgerHistory.mockReturnValue({ ...BASE_STATE, balanceCents: 2500, recordPayment });

    render();
    fireEvent.press(screen.getByTestId('record-payment-button'));
    fireEvent.press(screen.getByLabelText('Confirm recorded payment'));

    expect(recordPayment).toHaveBeenCalledWith(2500);
  });
});
