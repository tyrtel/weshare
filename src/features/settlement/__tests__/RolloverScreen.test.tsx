import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  useRouter:            () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: jest.fn(),
  useFocusEffect:       jest.fn(),
  Stack:                { Screen: () => null },
}));

jest.mock('../../../core/di/ServiceContext', () => ({
  useService: jest.fn().mockReturnValue({
    getState: jest.fn().mockReturnValue({ appendSplitRequest: jest.fn() }),
  }),
  useTripSessionStore: jest.fn(),
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView:      View,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('../hooks/useSettlement', () => ({
  useSettlement: jest.fn(),
}));

jest.mock('../hooks/useRollover', () => ({
  useRollover: jest.fn(),
}));

import { useLocalSearchParams } from 'expo-router';
import { useSettlement }        from '../hooks/useSettlement';
import { useRollover }          from '../hooks/useRollover';
import { RolloverScreen }       from '../screens/RolloverScreen';
import type { UseRolloverResult } from '../hooks/useRollover';

const mockParams       = useLocalSearchParams as jest.Mock;
const mockUseSettlement = useSettlement  as jest.Mock;
const mockUseRollover   = useRollover    as jest.Mock;

const IDLE_SETTLEMENT_STATE = {
  settlements:         [],
  members:             [],
  splitRequests:       [],
  loading:             false,
  error:               null,
  currentUserId:       null,
  tripStatus:          'active' as const,
  settling:            false,
  refetch:             jest.fn(),
  markSettled:         jest.fn(),
  updateRequestStatus: jest.fn(),
  reopenTrip:          jest.fn(),
  markDebtPaid:        jest.fn(),
  markDebtOwed:        jest.fn(),
};

function makeRolloverState(overrides: Partial<UseRolloverResult> = {}): UseRolloverResult {
  return {
    step:                 'pick-trip',
    availableTrips:       [],
    targetTripId:         null,
    targetMembers:        [],
    manualMatch:          null,
    seeds:                [],
    selectedIndices:      new Set(),
    loading:              false,
    error:                null,
    selectTargetTrip:     jest.fn(),
    overrideMatch:        jest.fn(),
    removeMatch:          jest.fn(),
    toggleSeedSelection:  jest.fn(),
    goNext:               jest.fn(),
    goBack:               jest.fn(),
    confirm:              jest.fn().mockResolvedValue(true),
    ...overrides,
  };
}

// ── Param guard ───────────────────────────────────────────────────────────────

describe('RolloverScreen — param validation', () => {
  it('shows error when tripId is missing', () => {
    mockParams.mockReturnValue({});
    render(<RolloverScreen />);
    expect(screen.getByText('Invalid navigation parameters.')).toBeTruthy();
  });

  it('shows error when tripId is empty', () => {
    mockParams.mockReturnValue({ tripId: '' });
    render(<RolloverScreen />);
    expect(screen.getByText('Invalid navigation parameters.')).toBeTruthy();
  });

  it('does not call useRollover when params are invalid', () => {
    mockParams.mockReturnValue({});
    render(<RolloverScreen />);
    expect(mockUseRollover).not.toHaveBeenCalled();
  });
});

// ── Step 1 — Pick Trip ────────────────────────────────────────────────────────

describe('RolloverScreen — Step 1 (pick-trip)', () => {
  beforeEach(() => {
    mockParams.mockReturnValue({ tripId: 't1' });
    mockUseSettlement.mockReturnValue(IDLE_SETTLEMENT_STATE);
  });

  it('shows empty-state when no available trips', () => {
    mockUseRollover.mockReturnValue(makeRolloverState({ availableTrips: [] }));
    render(<RolloverScreen />);
    expect(screen.getByText('No other trips to roll debts into.')).toBeTruthy();
  });

  it('renders a row for each available trip', () => {
    mockUseRollover.mockReturnValue(makeRolloverState({
      availableTrips: [
        { id: 'tA', name: 'Beach Trip', currency: 'EUR', status: 'active',  createdAt: new Date(), ownerId: 'u1', members: [] },
        { id: 'tB', name: 'Road Trip',  currency: 'GBP', status: 'settling', createdAt: new Date(), ownerId: 'u1', members: [] },
      ],
    }));
    render(<RolloverScreen />);
    expect(screen.getByText('Beach Trip')).toBeTruthy();
    expect(screen.getByText('Road Trip')).toBeTruthy();
  });

  it('calls selectTargetTrip when a trip row is tapped', () => {
    const selectTargetTrip = jest.fn();
    mockUseRollover.mockReturnValue(makeRolloverState({
      selectTargetTrip,
      availableTrips: [
        { id: 'tA', name: 'Beach Trip', currency: 'EUR', status: 'active', createdAt: new Date(), ownerId: 'u1', members: [] },
      ],
    }));
    render(<RolloverScreen />);
    fireEvent.press(screen.getByTestId('trip-row-tA'));
    expect(selectTargetTrip).toHaveBeenCalledWith('tA');
  });
});

// ── Step 4 — Confirm creates correct SplitRequests ────────────────────────────

describe('RolloverScreen — Step 4 (confirm)', () => {
  const SEEDS = [
    { fromUserId: 't1', toUserId: 't2', amountCents: 2500, currency: 'EUR', rolledOverFromTripId: 'src' },
    { fromUserId: 't3', toUserId: 't2', amountCents: 1000, currency: 'EUR', rolledOverFromTripId: 'src' },
  ];

  beforeEach(() => {
    mockParams.mockReturnValue({ tripId: 'src' });
    mockUseSettlement.mockReturnValue(IDLE_SETTLEMENT_STATE);
  });

  it('renders the confirm step with correct debt count and total', () => {
    mockUseRollover.mockReturnValue(makeRolloverState({
      step:            'confirm',
      targetTripId:    'tgt',
      seeds:           SEEDS,
      selectedIndices: new Set([0, 1]),
    }));
    render(<RolloverScreen />);
    expect(screen.getByText('2 debts · €35.00')).toBeTruthy();
  });

  it('calls confirm when the Roll Over Debts button is pressed', async () => {
    const confirm = jest.fn().mockResolvedValue(true);
    mockUseRollover.mockReturnValue(makeRolloverState({
      step:            'confirm',
      targetTripId:    'tgt',
      seeds:           SEEDS,
      selectedIndices: new Set([0, 1]),
      confirm,
    }));
    render(<RolloverScreen />);
    await act(async () => {
      fireEvent.press(screen.getByTestId('confirm-rollover'));
    });
    expect(confirm).toHaveBeenCalled();
  });

  it('disables the Roll Over Debts button when no seeds are selected', () => {
    mockUseRollover.mockReturnValue(makeRolloverState({
      step:            'confirm',
      targetTripId:    'tgt',
      seeds:           SEEDS,
      selectedIndices: new Set(),   // all deselected
    }));
    render(<RolloverScreen />);
    const btn = screen.getByTestId('confirm-rollover');
    // Disabled prop prevents onPress from firing.
    expect(btn.props.accessibilityState?.disabled ?? btn.props.disabled).toBeTruthy();
  });
});

