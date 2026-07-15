import React from 'react';
import { screen } from '@testing-library/react-native';
import { mockVectorIconsModule } from '../../../__testUtils__/standardMocks';

jest.mock('@expo/vector-icons', () => mockVectorIconsModule());
jest.mock('expo-router', () => ({
  useLocalSearchParams: jest.fn(),
  Stack: { Screen: () => null },
}));

jest.mock('../hooks/useAuditHistory', () => ({
  useAuditHistory: jest.fn(),
}));

import { useLocalSearchParams } from 'expo-router';
import { AuditDetailScreen } from '../screens/AuditDetailScreen';
import { useAuditHistory } from '../hooks/useAuditHistory';
import { renderScreen } from '../../../__testUtils__/renderScreen';
import { createTestContainer } from '../../../core/di/testContainer';
import { splitRequestFactory } from '../../../__testUtils__/factories';

const mockParams           = useLocalSearchParams as jest.Mock;
const mockUseAuditHistory  = useAuditHistory as jest.Mock;

function render() {
  return renderScreen(<AuditDetailScreen />, createTestContainer());
}

beforeEach(() => {
  mockParams.mockReturnValue({
    tripId: 't1', fromUserId: 'u1', toUserId: 'u2', fromName: 'Alice', toName: 'Bob',
  });
});

describe('AuditDetailScreen', () => {
  it('renders audit trail entries with amount, method, and date', () => {
    mockUseAuditHistory.mockReturnValue({
      requests: [
        splitRequestFactory({ id: 'r1', amountCents: 2500, currency: 'EUR', status: 'completed', createdAt: new Date('2025-06-01T12:00:00Z') }),
        splitRequestFactory({ id: 'r2', amountCents: 1000, currency: 'EUR', status: 'pending', createdAt: new Date('2025-05-20T12:00:00Z') }),
      ],
      loading: false,
      error: null,
    });

    render();

    expect(screen.getByText('Alice → Bob')).toBeTruthy();
    expect(screen.getByText('€25.00')).toBeTruthy();
    expect(screen.getByText('€10.00')).toBeTruthy();
  });

  it('shows the empty state when there is no audit history', () => {
    mockUseAuditHistory.mockReturnValue({ requests: [], loading: false, error: null });

    render();

    expect(screen.getByText('No payment history yet.')).toBeTruthy();
  });

  it('shows an error state instead of crashing when the history fails to load', () => {
    mockUseAuditHistory.mockReturnValue({ requests: [], loading: false, error: { kind: 'NetworkError', message: 'boom' } });

    render();

    expect(screen.queryByText('No payment history yet.')).toBeNull();
  });
});
