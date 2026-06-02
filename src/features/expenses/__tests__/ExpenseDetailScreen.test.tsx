import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

jest.mock('../../../core/utils/confirm', () => ({
  confirm: jest.fn(() => Promise.resolve(false)),
}));

const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter:            () => ({ push: jest.fn(), back: mockBack }),
  useLocalSearchParams: jest.fn(),
  Stack:                { Screen: () => null },
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView:      View,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('../hooks/useExpenseDetail', () => ({
  useExpenseDetail: jest.fn(),
}));

// useService is a jest.fn() so tests can override per describe block.
// Default: satisfies both MEMBER_REPO (getMembersForTrip) and TRIP_STORE (getState).
const mockRemoveExpense = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../core/di/ServiceContext', () => ({
  useService: jest.fn(() => ({
    getMembersForTrip: jest.fn().mockResolvedValue({ ok: true, value: [] }),
    getState: () => ({ removeExpense: mockRemoveExpense }),
  })),
  useTripSessionStore: jest.fn(() => null),
}));

import { useLocalSearchParams } from 'expo-router';
import { useExpenseDetail } from '../hooks/useExpenseDetail';
import { ExpenseDetailScreen } from '../screens/ExpenseDetailScreen';
import { confirm } from '../../../core/utils/confirm';

const mockConfirm = confirm as jest.Mock;

const mockParams           = useLocalSearchParams as jest.Mock;
const mockUseExpenseDetail = useExpenseDetail as jest.Mock;

const NOW = new Date('2025-06-01T12:00:00Z');

const BASE_EXPENSE = {
  id: 'e1',
  tripId: 't1',
  description: 'Dinner',
  totalAmountCents: 6000,
  currency: 'EUR',
  paidByUserId: 'u1',
  createdAt: NOW,
  splits: [],
  lineItems: [],
  metadata: {},
};

describe('ExpenseDetailScreen — param validation', () => {
  beforeEach(() => {
    mockUseExpenseDetail.mockReturnValue({ expense: null, loading: true, error: null });
  });

  it('shows error view when id is missing', () => {
    mockParams.mockReturnValue({});
    render(<ExpenseDetailScreen />);
    expect(screen.getByText('Invalid navigation parameters.')).toBeTruthy();
  });

  it('shows error view when id is an empty string', () => {
    mockParams.mockReturnValue({ id: '' });
    render(<ExpenseDetailScreen />);
    expect(screen.getByText('Invalid navigation parameters.')).toBeTruthy();
  });

  it('does not call useExpenseDetail when params are invalid', () => {
    mockParams.mockReturnValue({});
    render(<ExpenseDetailScreen />);
    expect(mockUseExpenseDetail).not.toHaveBeenCalled();
  });

  it('calls useExpenseDetail with the validated id', () => {
    mockParams.mockReturnValue({ id: 'e1' });
    render(<ExpenseDetailScreen />);
    expect(mockUseExpenseDetail).toHaveBeenCalledWith('e1');
  });
});

describe('ExpenseDetailScreen — delete action', () => {
  beforeEach(() => {
    mockBack.mockClear();
    mockRemoveExpense.mockClear();
    mockConfirm.mockResolvedValue(false);
    mockParams.mockReturnValue({ id: 'e1' });
    mockUseExpenseDetail.mockReturnValue({ expense: BASE_EXPENSE, loading: false, error: null });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders the "Delete expense" button when expense is loaded', () => {
    render(<ExpenseDetailScreen />);
    expect(screen.getByLabelText('Delete expense')).toBeTruthy();
  });

  it('shows a confirmation dialog when delete is pressed', () => {
    render(<ExpenseDetailScreen />);
    fireEvent.press(screen.getByLabelText('Delete expense'));
    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(mockConfirm.mock.calls[0][0]).toBe('Delete this expense?');
  });

  it('calls removeExpense and navigates back when delete is confirmed', async () => {
    mockConfirm.mockResolvedValue(true);

    render(<ExpenseDetailScreen />);
    fireEvent.press(screen.getByLabelText('Delete expense'));

    await waitFor(() => {
      expect(mockRemoveExpense).toHaveBeenCalledWith('e1', 't1');
    });
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('does not remove the expense when delete is declined', async () => {
    mockConfirm.mockResolvedValue(false);

    render(<ExpenseDetailScreen />);
    fireEvent.press(screen.getByLabelText('Delete expense'));

    await Promise.resolve();

    expect(mockRemoveExpense).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });
});
