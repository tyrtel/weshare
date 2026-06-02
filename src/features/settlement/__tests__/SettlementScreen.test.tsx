import React from 'react';
import { render, screen } from '@testing-library/react-native';

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

jest.mock('expo-haptics', () => ({
  impactAsync:          jest.fn(),
  ImpactFeedbackStyle: { Medium: 'Medium' },
}));

import { useLocalSearchParams } from 'expo-router';
import { useSettlement } from '../hooks/useSettlement';
import { SettlementScreen } from '../screens/SettlementScreen';

const mockParams        = useLocalSearchParams as jest.Mock;
const mockUseSettlement = useSettlement as jest.Mock;

const IDLE_STATE = {
  settlements:         [],
  members:             [],
  splitRequests:       [],
  loading:             false,
  error:               null,
  currentUserId:       null,
  tripStatus:          'active' as const,
  allSettled:          false,
  refetch:             jest.fn(),
  markSettled:         jest.fn(),
  updateRequestStatus: jest.fn(),
  reopenTrip:          jest.fn(),
  closeTrip:           jest.fn(),
  markDebtPaid:        jest.fn(),
  markDebtOwed:        jest.fn(),
};

// ---------------------------------------------------------------------------
// Param validation
// ---------------------------------------------------------------------------

describe('SettlementScreen — param validation', () => {
  beforeEach(() => {
    mockUseSettlement.mockReturnValue(IDLE_STATE);
  });

  it('shows error view when tripId is missing', () => {
    mockParams.mockReturnValue({});
    render(<SettlementScreen />);
    expect(screen.getByText('Invalid navigation parameters.')).toBeTruthy();
  });

  it('shows error view when tripId is an empty string', () => {
    mockParams.mockReturnValue({ tripId: '' });
    render(<SettlementScreen />);
    expect(screen.getByText('Invalid navigation parameters.')).toBeTruthy();
  });

  it('does not call useSettlement when params are invalid', () => {
    mockParams.mockReturnValue({});
    render(<SettlementScreen />);
    expect(mockUseSettlement).not.toHaveBeenCalled();
  });

  it('renders the settlement content with a valid tripId', () => {
    mockParams.mockReturnValue({ tripId: 't1' });
    render(<SettlementScreen />);
    expect(screen.queryByText('Invalid navigation parameters.')).toBeNull();
    expect(screen.getByText('Everyone is settled up.')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// All-settled bar
// ---------------------------------------------------------------------------

const PAID_SETTLEMENT = {
  fromUserId: 'u1', toUserId: 'u2', amountCents: 500, currency: 'EUR',
  fromDisplayName: 'A', toDisplayName: 'B',
  latestRequest: {
    id: 'sr1', tripId: 't1', status: 'paid' as const,
    requesterUserId: 'u2', payerUserId: 'u1',
    amountCents: 500, currency: 'EUR', note: '',
    preferredWallet: 'other', externalRefId: null,
    stripePaymentLinkId: null, stripeSessionId: null,
    obPaymentId: null, obProvider: null, rolledOverFromTripId: null,
    createdAt: new Date(), updatedAt: new Date(),
  },
};

describe('SettlementScreen — all-settled bar', () => {
  beforeEach(() => {
    mockParams.mockReturnValue({ tripId: 't1' });
  });

  it('shows the bar when allSettled is true', () => {
    mockUseSettlement.mockReturnValue({ ...IDLE_STATE, allSettled: true, settlements: [PAID_SETTLEMENT] });
    render(<SettlementScreen />);
    expect(screen.getByTestId('all-settled-bar')).toBeTruthy();
    expect(screen.getByText('All settled — Close Trip')).toBeTruthy();
  });

  it('hides the bar when allSettled is false', () => {
    mockUseSettlement.mockReturnValue({ ...IDLE_STATE, allSettled: false });
    render(<SettlementScreen />);
    expect(screen.queryByTestId('all-settled-bar')).toBeNull();
  });

  it('hides Close Trip link when allSettled bar is shown', () => {
    mockUseSettlement.mockReturnValue({ ...IDLE_STATE, allSettled: true, settlements: [PAID_SETTLEMENT] });
    render(<SettlementScreen />);
    expect(screen.queryByTestId('close-trip-button')).toBeNull();
  });

  it('calls closeTrip when the bar is pressed', async () => {
    const { fireEvent, act } = require('@testing-library/react-native');
    const closeTrip = jest.fn().mockResolvedValue(undefined);
    mockUseSettlement.mockReturnValue({ ...IDLE_STATE, allSettled: true, settlements: [PAID_SETTLEMENT], closeTrip });
    render(<SettlementScreen />);
    await act(async () => { fireEvent.press(screen.getByTestId('all-settled-bar')); });
    expect(closeTrip).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Roll Over Debts link
// ---------------------------------------------------------------------------

const ROLLABLE_SETTLEMENT = {
  fromUserId: 'u1', toUserId: 'u2', amountCents: 500, currency: 'EUR',
  fromDisplayName: 'A', toDisplayName: 'B', latestRequest: null,
};

describe('SettlementScreen — Roll Over Debts link', () => {
  beforeEach(() => {
    mockParams.mockReturnValue({ tripId: 't1' });
  });

  it('shows the link when rollable debts exist', () => {
    mockUseSettlement.mockReturnValue({ ...IDLE_STATE, settlements: [ROLLABLE_SETTLEMENT] });
    render(<SettlementScreen />);
    expect(screen.getByTestId('roll-over-debts-button')).toBeTruthy();
  });

  it('hides the link when all debts are settled', () => {
    mockUseSettlement.mockReturnValue({
      ...IDLE_STATE,
      allSettled: true,
      settlements: [PAID_SETTLEMENT],
    });
    render(<SettlementScreen />);
    expect(screen.queryByTestId('roll-over-debts-button')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Close Trip link
// ---------------------------------------------------------------------------

describe('SettlementScreen — Close Trip link', () => {
  beforeEach(() => {
    mockParams.mockReturnValue({ tripId: 't1' });
  });

  it('shows Close Trip when tripStatus is active', () => {
    mockUseSettlement.mockReturnValue({ ...IDLE_STATE, tripStatus: 'active' });
    render(<SettlementScreen />);
    expect(screen.getByTestId('close-trip-button')).toBeTruthy();
  });

  it('shows Close Trip when tripStatus is settling', () => {
    mockUseSettlement.mockReturnValue({ ...IDLE_STATE, tripStatus: 'settling' });
    render(<SettlementScreen />);
    expect(screen.getByTestId('close-trip-button')).toBeTruthy();
  });

  it('hides Close Trip when tripStatus is closed', () => {
    mockUseSettlement.mockReturnValue({ ...IDLE_STATE, tripStatus: 'closed' });
    render(<SettlementScreen />);
    expect(screen.queryByTestId('close-trip-button')).toBeNull();
  });

  it('hides Close Trip when allSettled bar is shown', () => {
    mockUseSettlement.mockReturnValue({ ...IDLE_STATE, allSettled: true, settlements: [PAID_SETTLEMENT] });
    render(<SettlementScreen />);
    expect(screen.queryByTestId('close-trip-button')).toBeNull();
  });
});
