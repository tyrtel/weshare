jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  Stack: { Screen: () => null },
}));

jest.mock('../hooks/useClosedTrips', () => ({
  useClosedTrips: jest.fn(),
}));

jest.mock('../../../core/di/ServiceContext', () => ({
  useService: jest.fn(),
  useTripSessionStore: jest.fn(() => ({})),
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: View,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ClosedTripsScreen } from '../screens/ClosedTripsScreen';
import { useClosedTrips } from '../hooks/useClosedTrips';
import { useTripSessionStore } from '../../../core/di/ServiceContext';
import { tripFactory } from '../../../__testUtils__/factories';

const mockUseClosedTrips = useClosedTrips as jest.Mock;
const mockUseTripSessionStore = useTripSessionStore as jest.Mock;

const NOW = new Date('2026-05-01T12:00:00Z');
const CLOSED_AT = new Date('2026-05-28T12:00:00Z');

describe('ClosedTripsScreen — card rendering', () => {
  beforeEach(() => {
    mockUseTripSessionStore.mockReturnValue({});
  });

  it('renders a card for each closed trip', () => {
    mockUseClosedTrips.mockReturnValue({
      trips: [tripFactory({ id: 't1', name: 'Trip t1', status: 'closed', closedAt: CLOSED_AT }), tripFactory({ id: 't2', name: 'Trip t2', status: 'closed', closedAt: CLOSED_AT }), tripFactory({ id: 't3', name: 'Trip t3', status: 'closed', closedAt: CLOSED_AT })],
      loading: false,
      error: null,
      refetch: jest.fn(),
    });

    render(<ClosedTripsScreen />);

    expect(screen.getByTestId('closed-trip-card-t1')).toBeTruthy();
    expect(screen.getByTestId('closed-trip-card-t2')).toBeTruthy();
    expect(screen.getByTestId('closed-trip-card-t3')).toBeTruthy();
  });

  it('shows trip names on the cards', () => {
    mockUseClosedTrips.mockReturnValue({
      trips: [tripFactory({ id: 't1', name: 'Trip t1', status: 'closed', closedAt: CLOSED_AT }), tripFactory({ id: 't2', name: 'Trip t2', status: 'closed', closedAt: CLOSED_AT })],
      loading: false,
      error: null,
      refetch: jest.fn(),
    });

    render(<ClosedTripsScreen />);

    expect(screen.getByText('Trip t1')).toBeTruthy();
    expect(screen.getByText('Trip t2')).toBeTruthy();
  });
});

describe('ClosedTripsScreen — empty state', () => {
  beforeEach(() => {
    mockUseTripSessionStore.mockReturnValue({});
  });

  it('shows the empty state when the trips list is empty', () => {
    mockUseClosedTrips.mockReturnValue({
      trips: [],
      loading: false,
      error: null,
      refetch: jest.fn(),
    });

    render(<ClosedTripsScreen />);

    expect(screen.getByTestId('closed-trips-empty')).toBeTruthy();
    expect(screen.getByText('No past trips yet.')).toBeTruthy();
  });

  it('does not show the empty state when trips are present', () => {
    mockUseClosedTrips.mockReturnValue({
      trips: [tripFactory({ id: 't1', name: 'Trip t1', status: 'closed', closedAt: CLOSED_AT })],
      loading: false,
      error: null,
      refetch: jest.fn(),
    });

    render(<ClosedTripsScreen />);

    expect(screen.queryByTestId('closed-trips-empty')).toBeNull();
  });
});
