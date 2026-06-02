import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react-native';

jest.mock('../../../core/utils/confirm', () => ({
  confirm: jest.fn(() => Promise.resolve(false)),
}));

// expo-router — useLocalSearchParams is a jest.fn() so each test can configure it.
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: jest.fn(() => ({ id: 't1' })),
  Stack: { Screen: () => null },
}));

// Avoid touching the real data hook — just control what the screen sees.
jest.mock('../hooks/useTripDetail', () => ({
  useTripDetail: jest.fn(),
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: View,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

jest.mock('react-native-svg', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: View, Svg: View, Path: View, G: View, Circle: View };
});

import { TripDetailScreen } from '../screens/TripDetailScreen';
import { useTripDetail } from '../hooks/useTripDetail';
import { useLocalSearchParams } from 'expo-router';
import { ServiceContext } from '../../../core/di/ServiceContext';
import { createTestContainer } from '../../../core/di/testContainer';
import { AUTH, SHARE, TRIP_REPO, TRIP_STORE } from '../../../core/di/tokens';
import { confirm } from '../../../core/utils/confirm';
import type { ServiceContainer } from '../../../core/di/ServiceContainer';
import type { MockShareService } from '../../../__mocks__/MockShareService';

const mockUseTripDetail        = useTripDetail as jest.Mock;
const mockUseLocalSearchParams = useLocalSearchParams as jest.Mock;
const mockConfirm              = confirm as jest.Mock;

const NOW = new Date('2025-06-01T12:00:00Z');

const BASE_TRIP = {
  id: 't1',
  name: 'Chez Paul',
  currency: 'EUR',
  ownerId: 'u1',
  createdAt: NOW,
  members: [],
  inviteToken: 'ABC12345',
  status: 'active' as const,
  closedAt: null,
};

function makeWrapper(container: ServiceContainer) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(ServiceContext.Provider, { value: container }, children);
  };
}

describe('TripDetailScreen — post-create invite nudge', () => {
  let container: ServiceContainer;

  beforeEach(async () => {
    container = createTestContainer();
    const auth = container.resolve(AUTH);
    await auth.signInAsGuest('Jay');

    mockConfirm.mockResolvedValue(false);

    mockUseTripDetail.mockReturnValue({
      trip: BASE_TRIP,
      expenses: [],
      loading: false,
      error: null,
      refetch: jest.fn(),
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('shows "Trip created!" confirm when showInvitePrompt=true', () => {
    mockUseLocalSearchParams.mockReturnValue({ id: 't1', showInvitePrompt: 'true' });

    render(<TripDetailScreen />, { wrapper: makeWrapper(container) });

    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(mockConfirm.mock.calls[0][0]).toBe('Trip created!');
    expect(mockConfirm.mock.calls[0][1]).toMatch(/invite link/i);
  });

  it('does not show the confirm when showInvitePrompt is absent', () => {
    mockUseLocalSearchParams.mockReturnValue({ id: 't1' });

    render(<TripDetailScreen />, { wrapper: makeWrapper(container) });

    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('does not show the confirm when showInvitePrompt is not "true"', () => {
    mockUseLocalSearchParams.mockReturnValue({ id: 't1', showInvitePrompt: 'false' });

    render(<TripDetailScreen />, { wrapper: makeWrapper(container) });

    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('calls share.shareTrip when invite confirm is accepted', async () => {
    mockConfirm.mockResolvedValue(true);
    mockUseLocalSearchParams.mockReturnValue({ id: 't1', showInvitePrompt: 'true' });

    const shareService = container.resolve(SHARE) as unknown as MockShareService;

    render(<TripDetailScreen />, { wrapper: makeWrapper(container) });

    await waitFor(() => {
      expect(shareService.calls).toHaveLength(1);
    });
    expect(shareService.calls[0]).toEqual({ tripId: 't1', tripName: 'Chez Paul' });
  });

  it('does not call share.shareTrip when invite confirm is declined', async () => {
    mockConfirm.mockResolvedValue(false);
    mockUseLocalSearchParams.mockReturnValue({ id: 't1', showInvitePrompt: 'true' });

    const shareService = container.resolve(SHARE) as unknown as MockShareService;

    render(<TripDetailScreen />, { wrapper: makeWrapper(container) });

    await Promise.resolve();

    expect(shareService.calls).toHaveLength(0);
  });

  it('does not show the confirm twice if the component re-renders', () => {
    mockUseLocalSearchParams.mockReturnValue({ id: 't1', showInvitePrompt: 'true' });

    const { rerender } = render(<TripDetailScreen />, { wrapper: makeWrapper(container) });
    rerender(<TripDetailScreen />);

    expect(mockConfirm).toHaveBeenCalledTimes(1);
  });

  it('does not show the confirm when the trip has not loaded yet', () => {
    mockUseLocalSearchParams.mockReturnValue({ id: 't1', showInvitePrompt: 'true' });
    mockUseTripDetail.mockReturnValue({
      trip: null,
      expenses: [],
      loading: true,
      error: null,
      refetch: jest.fn(),
    });

    render(<TripDetailScreen />, { wrapper: makeWrapper(container) });

    expect(mockConfirm).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Settle button — status-aware rendering
// ---------------------------------------------------------------------------

const EXPENSE = {
  id: 'e1', tripId: 't1', description: 'Hotel',
  totalAmountCents: 10000, currency: 'EUR',
  paidByUserId: 'u1', createdAt: NOW, splits: [], metadata: {},
};

describe('TripDetailScreen — settle button', () => {
  beforeEach(() => {
    mockUseLocalSearchParams.mockReturnValue({ id: 't1' });
  });

  it('shows "Settle Up" when status is active and there are expenses', () => {
    mockUseTripDetail.mockReturnValue({
      trip: { ...BASE_TRIP, status: 'active' },
      expenses: [EXPENSE],
      loading: false, error: null, refetch: jest.fn(),
    });

    render(<TripDetailScreen />, { wrapper: makeWrapper(createTestContainer()) });

    expect(screen.getByText('Settle Up')).toBeTruthy();
  });

  it('shows "Settling in progress" when status is settling', () => {
    mockUseTripDetail.mockReturnValue({
      trip: { ...BASE_TRIP, status: 'settling' },
      expenses: [EXPENSE],
      loading: false, error: null, refetch: jest.fn(),
    });

    render(<TripDetailScreen />, { wrapper: makeWrapper(createTestContainer()) });

    expect(screen.getByText('Settling in progress')).toBeTruthy();
  });

  it('hides the settle button when status is closed', () => {
    mockUseTripDetail.mockReturnValue({
      trip: { ...BASE_TRIP, status: 'closed' },
      expenses: [EXPENSE],
      loading: false, error: null, refetch: jest.fn(),
    });

    render(<TripDetailScreen />, { wrapper: makeWrapper(createTestContainer()) });

    expect(screen.queryByText('Settle Up')).toBeNull();
    expect(screen.queryByText('Settling in progress')).toBeNull();
  });

  it('hides the settle button when there are no expenses', () => {
    mockUseTripDetail.mockReturnValue({
      trip: { ...BASE_TRIP, status: 'active' },
      expenses: [],
      loading: false, error: null, refetch: jest.fn(),
    });

    render(<TripDetailScreen />, { wrapper: makeWrapper(createTestContainer()) });

    expect(screen.queryByText('Settle Up')).toBeNull();
  });

  it('pressing "Settle Up" navigates without changing trip status', async () => {
    const { fireEvent } = require('@testing-library/react-native');

    const container = createTestContainer();
    const auth = container.resolve(AUTH);
    await auth.signInAsGuest('Jay');

    const tripRepo = container.resolve(TRIP_REPO);
    await tripRepo.saveTrip({ ...BASE_TRIP, status: 'active' });

    mockUseTripDetail.mockReturnValue({
      trip: { ...BASE_TRIP, status: 'active' },
      expenses: [EXPENSE],
      loading: false, error: null, refetch: jest.fn(),
    });

    render(<TripDetailScreen />, { wrapper: makeWrapper(container) });

    fireEvent.press(screen.getByText('Settle Up'));

    // No confirm should fire — locking now happens from SettlementScreen FAB.
    expect(mockConfirm).not.toHaveBeenCalled();

    // Trip status must remain 'active' — navigate only, no status change here.
    const stored = await tripRepo.getTrip('t1');
    expect(stored.ok && stored.value.status).toBe('active');
  });
});

// ---------------------------------------------------------------------------
// ClosedTripBanner vs BalanceBubblesSection
// ---------------------------------------------------------------------------

describe('TripDetailScreen — closed trip banner', () => {
  beforeEach(() => {
    mockUseLocalSearchParams.mockReturnValue({ id: 't1' });
  });

  it('renders ClosedTripBanner when status is closed', () => {
    mockUseTripDetail.mockReturnValue({
      trip: { ...BASE_TRIP, status: 'closed' as const, closedAt: new Date('2026-05-28T10:00:00Z') },
      expenses: [],
      loading: false, error: null, refetch: jest.fn(),
    });
    render(<TripDetailScreen />, { wrapper: makeWrapper(createTestContainer()) });
    expect(screen.getByTestId('closed-trip-banner')).toBeTruthy();
  });

  it('does not render ClosedTripBanner when status is active', () => {
    mockUseTripDetail.mockReturnValue({
      trip: { ...BASE_TRIP, status: 'active' as const },
      expenses: [],
      loading: false, error: null, refetch: jest.fn(),
    });
    render(<TripDetailScreen />, { wrapper: makeWrapper(createTestContainer()) });
    expect(screen.queryByTestId('closed-trip-banner')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Close Trip button
// ---------------------------------------------------------------------------

describe('TripDetailScreen — close trip button', () => {
  beforeEach(() => {
    mockUseLocalSearchParams.mockReturnValue({ id: 't1' });
    mockConfirm.mockResolvedValue(false);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('shows the close-trip button when status is active', () => {
    mockUseTripDetail.mockReturnValue({
      trip: { ...BASE_TRIP, status: 'active' },
      expenses: [], loading: false, error: null, refetch: jest.fn(),
    });
    render(<TripDetailScreen />, { wrapper: makeWrapper(createTestContainer()) });
    expect(screen.getByTestId('close-trip-button')).toBeTruthy();
  });

  it('shows the close-trip button when status is settling', () => {
    mockUseTripDetail.mockReturnValue({
      trip: { ...BASE_TRIP, status: 'settling' },
      expenses: [], loading: false, error: null, refetch: jest.fn(),
    });
    render(<TripDetailScreen />, { wrapper: makeWrapper(createTestContainer()) });
    expect(screen.getByTestId('close-trip-button')).toBeTruthy();
  });

  it('hides the close-trip button when status is closed', () => {
    mockUseTripDetail.mockReturnValue({
      trip: { ...BASE_TRIP, status: 'closed' },
      expenses: [], loading: false, error: null, refetch: jest.fn(),
    });
    render(<TripDetailScreen />, { wrapper: makeWrapper(createTestContainer()) });
    expect(screen.queryByTestId('close-trip-button')).toBeNull();
  });

  it('shows "Close Trip?" confirm when close button is pressed', () => {
    const { fireEvent } = require('@testing-library/react-native');
    mockUseTripDetail.mockReturnValue({
      trip: { ...BASE_TRIP, status: 'active' },
      expenses: [], loading: false, error: null, refetch: jest.fn(),
    });
    render(<TripDetailScreen />, { wrapper: makeWrapper(createTestContainer()) });
    fireEvent.press(screen.getByTestId('close-trip-button'));
    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(mockConfirm.mock.calls[0][0]).toBe('Close Trip?');
  });

  it('calls setTripStatus("closed") when close is confirmed', async () => {
    const { fireEvent } = require('@testing-library/react-native');
    mockConfirm.mockResolvedValue(true);

    const container = createTestContainer();
    const auth      = container.resolve(AUTH);
    await auth.signInAsGuest('Jay');

    const tripRepo = container.resolve(TRIP_REPO);
    await tripRepo.saveTrip({ ...BASE_TRIP, status: 'active' });
    const storeApi = container.resolve(TRIP_STORE);
    await storeApi.getState().loadTripDetail('t1');

    mockUseTripDetail.mockReturnValue({
      trip: { ...BASE_TRIP, status: 'active' },
      expenses: [], loading: false, error: null, refetch: jest.fn(),
    });

    render(<TripDetailScreen />, { wrapper: makeWrapper(container) });

    fireEvent.press(screen.getByTestId('close-trip-button'));

    await waitFor(async () => {
      const storedTrip = await tripRepo.getTrip('t1');
      expect(storedTrip.ok && storedTrip.value.status).toBe('closed');
    });
  });
});
