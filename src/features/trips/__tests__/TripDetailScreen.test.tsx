import React from 'react';
import { screen, waitFor } from '@testing-library/react-native';
import { mockExpoRouterModule, mockVectorIconsModule, mockSafeAreaModule, mockSvgModule } from '../../../__testUtils__/standardMocks';

jest.mock('../../../core/utils/confirm', () => ({
  confirm: jest.fn(() => Promise.resolve(false)),
}));

jest.mock('expo-router', () => mockExpoRouterModule());

// Avoid touching the real data hook — just control what the screen sees.
jest.mock('../hooks/useTripDetail', () => ({
  useTripDetail: jest.fn(),
}));

jest.mock('react-native-safe-area-context', () => mockSafeAreaModule());
jest.mock('@expo/vector-icons', () => mockVectorIconsModule());
jest.mock('react-native-svg', () => mockSvgModule());

import { TripDetailScreen } from '../screens/TripDetailScreen';
import { useTripDetail } from '../hooks/useTripDetail';
import { useLocalSearchParams } from 'expo-router';
import { renderScreen } from '../../../__testUtils__/renderScreen';
import { createTestContainer } from '../../../core/di/testContainer';
import { AUTH, TRIP_REPO, SPLIT_REQUEST_REPO } from '../../../core/di/tokens';
import { confirm } from '../../../core/utils/confirm';
import { splitFactory, splitRequestFactory } from '../../../__testUtils__/factories';
import type { InMemorySplitRequestRepository } from '../../../__mocks__/InMemorySplitRequestRepository';

const mockUseTripDetail        = useTripDetail as jest.Mock;
const mockUseLocalSearchParams = useLocalSearchParams as jest.Mock;

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

const EXPENSE = {
  id: 'e1', tripId: 't1', description: 'Hotel',
  totalAmountCents: 10000, currency: 'EUR',
  paidByUserId: 'u1', createdAt: NOW, splits: [], metadata: {},
};

// ---------------------------------------------------------------------------
// Expense row — no bogus split-mode label
// ---------------------------------------------------------------------------

// Regression: Expense has no splitMode field — item.splitMode always resolved
// to undefined, so `item.splitMode ?? 'equal'` was showing the literal text
// "equal" next to every expense regardless of how it was actually split.
describe('TripDetailScreen — expense row meta text', () => {
  it('shows only who paid, with no split-mode suffix', () => {
    mockUseLocalSearchParams.mockReturnValue({ id: 't1' });
    mockUseTripDetail.mockReturnValue({
      trip: { ...BASE_TRIP, status: 'active' },
      expenses: [EXPENSE],
      loading: false, error: null, refetch: jest.fn(),
    });

    renderScreen(<TripDetailScreen />, createTestContainer());

    expect(screen.getByText('Unknown paid')).toBeTruthy();
    expect(screen.queryByText(/equal/i)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Settle button — status-aware rendering
// ---------------------------------------------------------------------------

describe('TripDetailScreen — settle button', () => {
  beforeEach(() => {
    mockUseLocalSearchParams.mockReturnValue({ id: 't1' });
  });

  it('shows "Settle trip" when status is active and there are expenses', () => {
    mockUseTripDetail.mockReturnValue({
      trip: { ...BASE_TRIP, status: 'active' },
      expenses: [EXPENSE],
      loading: false, error: null, refetch: jest.fn(),
    });

    renderScreen(<TripDetailScreen />, createTestContainer());

    expect(screen.getByText('Settle trip')).toBeTruthy();
  });

  it('hides the settle button when status is closed', () => {
    mockUseTripDetail.mockReturnValue({
      trip: { ...BASE_TRIP, status: 'closed' },
      expenses: [EXPENSE],
      loading: false, error: null, refetch: jest.fn(),
    });

    renderScreen(<TripDetailScreen />, createTestContainer());

    expect(screen.queryByText('Settle trip')).toBeNull();
  });

  it('hides the settle button when there are no expenses', () => {
    mockUseTripDetail.mockReturnValue({
      trip: { ...BASE_TRIP, status: 'active' },
      expenses: [],
      loading: false, error: null, refetch: jest.fn(),
    });

    renderScreen(<TripDetailScreen />, createTestContainer());

    expect(screen.queryByText('Settle trip')).toBeNull();
  });

  it('pressing "Settle trip" navigates without changing trip status', async () => {
    const { fireEvent } = require('@testing-library/react-native');

    const container = createTestContainer();
    const auth = container.resolve(AUTH);
    await auth.signIn('jay@example.com', 'password');

    const tripRepo = container.resolve(TRIP_REPO);
    await tripRepo.saveTrip({ ...BASE_TRIP, status: 'active' });

    mockUseTripDetail.mockReturnValue({
      trip: { ...BASE_TRIP, status: 'active' },
      expenses: [EXPENSE],
      loading: false, error: null, refetch: jest.fn(),
    });

    renderScreen(<TripDetailScreen />, container);

    fireEvent.press(screen.getByText('Settle trip'));

    // No confirm should fire — settlement happens from SettlementScreen.
    expect(confirm).not.toHaveBeenCalled();

    // Trip status must remain 'active' — navigate only.
    const stored = await tripRepo.getTrip('t1');
    expect(stored.ok && stored.value.status).toBe('active');
  });
});

// ---------------------------------------------------------------------------
// "YOUR NET" — reflects completed ledger payments, not just raw expense debits
// ---------------------------------------------------------------------------

describe('TripDetailScreen — YOUR NET reflects the ledger', () => {
  beforeEach(() => {
    mockUseLocalSearchParams.mockReturnValue({ id: 't1' });
  });

  it('drops to zero once a completed payment covers the current user\'s debt', async () => {
    const container = createTestContainer();
    const auth = container.resolve(AUTH);
    const signedIn = await auth.signIn('jay@example.com', 'password');
    const currentUserId = signedIn.ok ? signedIn.value.id : '';

    const trip = {
      ...BASE_TRIP,
      members: [
        { userId: currentUserId, tripId: 't1', displayName: 'Jay', joinedAt: NOW, isGuest: false },
        { userId: 'u2', tripId: 't1', displayName: 'Marie', joinedAt: NOW, isGuest: false },
      ],
    };
    // Marie paid €100; Jay owes Marie €50.
    const expense = {
      ...EXPENSE,
      paidByUserId: 'u2',
      splits: [
        splitFactory({ id: 's1', expenseId: 'e1', userId: currentUserId, amountOwedCents: 5000 }),
        splitFactory({ id: 's2', expenseId: 'e1', userId: 'u2', amountOwedCents: 5000 }),
      ],
    };

    (container.resolve(SPLIT_REQUEST_REPO) as InMemorySplitRequestRepository).seed([
      splitRequestFactory({ id: 'r1', tripId: 't1', payerUserId: currentUserId, requesterUserId: 'u2', amountCents: 5000, status: 'completed' }),
    ]);

    mockUseTripDetail.mockReturnValue({
      trip, expenses: [expense], loading: false, error: null, refetch: jest.fn(),
    });

    renderScreen(<TripDetailScreen />, container);

    // "+€0.00" shows up more than once (the stat card's "YOUR NET" plus each
    // member's own row in the balance selector below it, since the payment
    // zeroes out both sides of the pair) — assert it renders at all rather
    // than pin down which specific element, and assert the pre-payment
    // negative figure ("−€50.00") is gone.
    await waitFor(() => expect(screen.getAllByText('+€0.00').length).toBeGreaterThan(0));
    expect(screen.queryByText('−€50.00')).toBeNull();
  });
});
