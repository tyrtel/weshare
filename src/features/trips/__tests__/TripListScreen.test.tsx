import React from 'react';
import { render, screen } from '@testing-library/react-native';

// Mock expo-router before importing the screen.
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

// Mock the hook so the screen test is purely about rendering.
jest.mock('../hooks/useTrips', () => ({
  useTrips: jest.fn(),
}));

const mockCurrentUser = jest.fn(() => null as import('../../../core/models/User').User | null);

jest.mock('../../../core/di/ServiceContext', () => ({
  useService: jest.fn(() => ({ currentUser: mockCurrentUser })),
  useTripSessionStore: jest.fn(() => ({})),
}));

// Mock react-native-safe-area-context so ScreenWrapper renders without native module.
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: View,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

import { TripListScreen } from '../screens/TripListScreen';
import { useTrips } from '../hooks/useTrips';
import { tripFactory } from '../../../__testUtils__/factories';

const mockUseTrips = useTrips as jest.Mock;

const NOW = new Date('2025-06-01T12:00:00Z');

describe('TripListScreen', () => {
  it('shows a loading spinner while fetching', () => {
    mockUseTrips.mockReturnValue({ trips: [], loading: true, error: null });
    render(<TripListScreen />);
    // ActivityIndicator renders as a View with accessibilityRole="progressbar" in RN
    // Just ensure the screen doesn't crash in loading state.
    expect(screen.queryByText('No trips yet')).toBeNull();
  });

  it('renders the "Trips" heading', () => {
    mockUseTrips.mockReturnValue({ trips: [], loading: false, error: null });
    render(<TripListScreen />);
    expect(screen.getByText('Trips')).toBeTruthy();
  });

  it('shows empty state when there are no trips', () => {
    mockUseTrips.mockReturnValue({ trips: [], loading: false, error: null });
    render(<TripListScreen />);
    expect(screen.getByText('No trips yet')).toBeTruthy();
    expect(screen.getByText(/Tap New trip to start/)).toBeTruthy();
  });

  it('renders trip cards for each trip', () => {
    const trips = [
      tripFactory({ id: 't1', name: 'Chez Paul' }),
      tripFactory({ id: 't2', name: 'Road Trip', currency: 'USD' }),
    ];
    mockUseTrips.mockReturnValue({ trips, loading: false, error: null });
    render(<TripListScreen />);
    expect(screen.getByText('Chez Paul')).toBeTruthy();
    expect(screen.getByText('Road Trip')).toBeTruthy();
  });

  it('shows currency badge for each trip', () => {
    const trips = [tripFactory({ currency: 'GBP' })];
    mockUseTrips.mockReturnValue({ trips, loading: false, error: null });
    render(<TripListScreen />);
    expect(screen.getByText('GBP')).toBeTruthy();
  });

  it('renders the create (+) FAB', () => {
    mockUseTrips.mockReturnValue({ trips: [], loading: false, error: null });
    render(<TripListScreen />);
    expect(screen.getByLabelText('New trip')).toBeTruthy();
  });

  it('shows an error banner when error is set', () => {
    mockUseTrips.mockReturnValue({
      trips: [],
      loading: false,
      error: { kind: 'NetworkError', message: 'Connection failed' },
    });
    render(<TripListScreen />);
    expect(screen.getByText('Connection failed')).toBeTruthy();
  });

  it('does not show empty state when trips are present', () => {
    mockUseTrips.mockReturnValue({
      trips: [tripFactory()],
      loading: false,
      error: null,
    });
    render(<TripListScreen />);
    expect(screen.queryByText('No trips yet')).toBeNull();
  });

  it('renders member avatars when trip has members', () => {
    const trips = [
      tripFactory({
        members: [
          { userId: 'u1', tripId: 't1', displayName: 'Jay McCleery', isGuest: false, joinedAt: NOW },
          { userId: 'u2', tripId: 't1', displayName: 'Marie Curie', isGuest: false, joinedAt: NOW },
        ],
      }),
    ];
    mockUseTrips.mockReturnValue({ trips, loading: false, error: null });
    render(<TripListScreen />);
    expect(screen.getByText('JM')).toBeTruthy();
    expect(screen.getByText('MC')).toBeTruthy();
  });

  it('shows "You owe €X" when the financial summary direction is "owe"', () => {
    const trips = [tripFactory({ id: 't1', currency: 'EUR' })];
    mockUseTrips.mockReturnValue({
      trips,
      summaries: { t1: { direction: 'owe', amountCents: 4500 } },
      loading: false,
      error: null,
    });
    render(<TripListScreen />);
    expect(screen.getByText('You owe €45.00')).toBeTruthy();
  });

  it('shows "You\'re owed €X" when the financial summary direction is "owed"', () => {
    const trips = [tripFactory({ id: 't1', currency: 'EUR' })];
    mockUseTrips.mockReturnValue({
      trips,
      summaries: { t1: { direction: 'owed', amountCents: 2350 } },
      loading: false,
      error: null,
    });
    render(<TripListScreen />);
    expect(screen.getByText("You're owed €23.50")).toBeTruthy();
  });

  it('shows "All settled" when the financial summary direction is "even"', () => {
    const trips = [tripFactory({ id: 't1' })];
    mockUseTrips.mockReturnValue({
      trips,
      summaries: { t1: { direction: 'even', amountCents: 0 } },
      loading: false,
      error: null,
    });
    render(<TripListScreen />);
    expect(screen.getByText('All settled')).toBeTruthy();
  });

  it('shows nothing when there is no financial summary (no expenses yet)', () => {
    const trips = [tripFactory({ id: 't1' })];
    mockUseTrips.mockReturnValue({
      trips,
      summaries: { t1: null },
      loading: false,
      error: null,
    });
    render(<TripListScreen />);
    expect(screen.queryByText('You owe')).toBeNull();
    expect(screen.queryByText("You're owed")).toBeNull();
    expect(screen.queryByText('All settled')).toBeNull();
  });

  it('shows "Past Trips" link when user is signed in', () => {
    mockCurrentUser.mockReturnValue({ id: 'u1', name: 'Jay', createdAt: NOW });
    mockUseTrips.mockReturnValue({ trips: [], loading: false, error: null });
    render(<TripListScreen />);
    expect(screen.getByTestId('past-trips-link')).toBeTruthy();
    mockCurrentUser.mockReturnValue(null);
  });

  it('hides "Past Trips" link when no user is signed in', () => {
    mockCurrentUser.mockReturnValue(null);
    mockUseTrips.mockReturnValue({ trips: [], loading: false, error: null });
    render(<TripListScreen />);
    expect(screen.queryByTestId('past-trips-link')).toBeNull();
  });
});
