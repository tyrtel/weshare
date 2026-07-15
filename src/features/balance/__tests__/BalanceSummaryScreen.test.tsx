import React from 'react';
import { screen } from '@testing-library/react-native';
import { mockVectorIconsModule, mockSvgModule } from '../../../__testUtils__/standardMocks';

jest.mock('@expo/vector-icons', () => mockVectorIconsModule());
jest.mock('react-native-svg', () => mockSvgModule());
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

import { BalanceSummaryScreen } from '../screens/BalanceSummaryScreen';
import { renderScreen } from '../../../__testUtils__/renderScreen';
import { createTestContainer } from '../../../core/di/testContainer';
import { AUTH, TRIP_REPO, EXPENSE_REPO, TRIP_STORE } from '../../../core/di/tokens';
import { tripFactory, expenseFactory, splitFactory } from '../../../__testUtils__/factories';
import { formatCurrency } from '../../../core/utils/formatCurrency';
import type { ServiceContainer } from '../../../core/di/ServiceContainer';

async function seedHydrated(container: ServiceContainer) {
  const auth = container.resolve(AUTH);
  const result = await auth.signIn('me@example.com', 'password');
  const userId = result.ok ? result.value.id : '';
  const store = container.resolve(TRIP_STORE);
  await store.getState().loadTrips(userId);
  return { auth, store, userId };
}

function render(container: ServiceContainer = createTestContainer()) {
  return renderScreen(<BalanceSummaryScreen />, container);
}

describe('BalanceSummaryScreen', () => {
  it('shows "owed" for a trip where the user is net positive, in the correct currency', async () => {
    const container = createTestContainer();
    const { store, userId } = await seedHydrated(container);

    const trip = tripFactory({ id: 't1', currency: 'USD', status: 'active', ownerId: userId });
    await container.resolve(TRIP_REPO).saveTrip(trip);
    await store.getState().loadTrips(userId);

    const expense = expenseFactory({
      id: 'e1', tripId: 't1', currency: 'USD',
      totalAmountCents: 5000, paidByUserId: userId,
      splits: [
        splitFactory({ id: 's1', expenseId: 'e1', userId, amountOwedCents: 2000 }),
        splitFactory({ id: 's2', expenseId: 'e1', userId: 'friend', amountOwedCents: 3000 }),
      ],
    });
    await container.resolve(EXPENSE_REPO).saveExpense(expense);
    store.getState().appendExpense(expense);

    render(container);

    // Net = paid (5000) - own share (2000) = +3000 → owed $30.00, not €.
    expect(screen.getAllByText(`owed ${formatCurrency(3000, 'USD')}`).length).toBeGreaterThanOrEqual(1);
  });

  it('shows "owe" for a trip where the user is net negative', async () => {
    const container = createTestContainer();
    const { store, userId } = await seedHydrated(container);

    const trip = tripFactory({ id: 't1', currency: 'EUR', status: 'active', ownerId: userId });
    await container.resolve(TRIP_REPO).saveTrip(trip);
    await store.getState().loadTrips(userId);

    const expense = expenseFactory({
      id: 'e1', tripId: 't1', currency: 'EUR',
      totalAmountCents: 4000, paidByUserId: 'friend',
      splits: [splitFactory({ id: 's1', expenseId: 'e1', userId, amountOwedCents: 1500 })],
    });
    await container.resolve(EXPENSE_REPO).saveExpense(expense);
    store.getState().appendExpense(expense);

    render(container);

    expect(screen.getAllByText(`owe ${formatCurrency(1500, 'EUR')}`).length).toBeGreaterThanOrEqual(1);
  });

  it('shows "settled" when net balance is exactly zero', async () => {
    const container = createTestContainer();
    const { store, userId } = await seedHydrated(container);

    const trip = tripFactory({ id: 't1', currency: 'EUR', status: 'active', ownerId: userId });
    await container.resolve(TRIP_REPO).saveTrip(trip);
    await store.getState().loadTrips(userId);

    const expense = expenseFactory({
      id: 'e1', tripId: 't1', currency: 'EUR',
      totalAmountCents: 2000, paidByUserId: userId,
      splits: [splitFactory({ id: 's1', expenseId: 'e1', userId, amountOwedCents: 2000 })],
    });
    await container.resolve(EXPENSE_REPO).saveExpense(expense);
    store.getState().appendExpense(expense);

    render(container);

    expect(screen.getAllByText('settled').length).toBeGreaterThanOrEqual(1);
  });

  it('shows the empty state when there are no trips', async () => {
    const container = createTestContainer();
    await seedHydrated(container);
    render(container);

    expect(screen.getByText('No balance yet')).toBeTruthy();
  });
});
