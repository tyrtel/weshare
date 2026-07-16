import React from 'react';
import { screen, waitFor } from '@testing-library/react-native';
import { mockVectorIconsModule, mockSvgModule, mockExpoRouterModule } from '../../../__testUtils__/standardMocks';

jest.mock('@expo/vector-icons', () => mockVectorIconsModule());
jest.mock('react-native-svg', () => mockSvgModule());
jest.mock('expo-router', () => mockExpoRouterModule());

import { BalanceSummaryScreen } from '../screens/BalanceSummaryScreen';
import { renderScreen } from '../../../__testUtils__/renderScreen';
import { createTestContainer } from '../../../core/di/testContainer';
import { AUTH, TRIP_REPO, EXPENSE_REPO, GROUP_REPO, TRIP_STORE } from '../../../core/di/tokens';
import { tripFactory, expenseFactory, splitFactory, memberFactory, groupFactory, groupMemberFactory } from '../../../__testUtils__/factories';
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
  it('shows "owed" for a standalone trip where the user is net positive, in the correct currency', async () => {
    const container = createTestContainer();
    const { store, userId } = await seedHydrated(container);

    const trip = tripFactory({
      id: 't1', currency: 'USD', status: 'active', ownerId: userId,
      members: [memberFactory({ userId, tripId: 't1' }), memberFactory({ userId: 'friend', tripId: 't1', displayName: 'Friend' })],
    });
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
    await waitFor(() => {
      expect(screen.getAllByText(`owed ${formatCurrency(3000, 'USD')}`).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows "owe" for a standalone trip where the user is net negative', async () => {
    const container = createTestContainer();
    const { store, userId } = await seedHydrated(container);

    const trip = tripFactory({
      id: 't1', currency: 'EUR', status: 'active', ownerId: userId,
      members: [memberFactory({ userId, tripId: 't1' }), memberFactory({ userId: 'friend', tripId: 't1', displayName: 'Friend' })],
    });
    await container.resolve(TRIP_REPO).saveTrip(trip);
    await store.getState().loadTrips(userId);

    const expense = expenseFactory({
      id: 'e1', tripId: 't1', currency: 'EUR',
      totalAmountCents: 4000, paidByUserId: 'friend',
      splits: [
        splitFactory({ id: 's1', expenseId: 'e1', userId, amountOwedCents: 1500 }),
        splitFactory({ id: 's2', expenseId: 'e1', userId: 'friend', amountOwedCents: 2500 }),
      ],
    });
    await container.resolve(EXPENSE_REPO).saveExpense(expense);
    store.getState().appendExpense(expense);

    render(container);

    await waitFor(() => {
      expect(screen.getAllByText(`owe ${formatCurrency(1500, 'EUR')}`).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows "settled" when net balance is exactly zero', async () => {
    const container = createTestContainer();
    const { store, userId } = await seedHydrated(container);

    const trip = tripFactory({
      id: 't1', currency: 'EUR', status: 'active', ownerId: userId,
      members: [memberFactory({ userId, tripId: 't1' })],
    });
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

    await waitFor(() => {
      expect(screen.getAllByText('settled').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows the empty state when there are no trips or groups', async () => {
    const container = createTestContainer();
    await seedHydrated(container);
    render(container);

    await waitFor(() => {
      expect(screen.getByText('No balance yet')).toBeTruthy();
    });
  });

  it('does not show a trip individually once it belongs to a group — only the group\'s aggregate line', async () => {
    const container = createTestContainer();
    const { store, userId } = await seedHydrated(container);

    const group = groupFactory({
      id: 'g1', name: 'Flatmates', currency: 'EUR', ownerId: userId,
      members: [groupMemberFactory({ userId, groupId: 'g1', displayName: 'Me' }), groupMemberFactory({ userId: 'friend', groupId: 'g1', displayName: 'Friend' })],
    });
    await container.resolve(GROUP_REPO).saveGroup(group);

    const trip = tripFactory({
      id: 't1', name: 'Group Trip', currency: 'EUR', ownerId: userId, groupId: 'g1',
      members: [memberFactory({ userId, tripId: 't1' }), memberFactory({ userId: 'friend', tripId: 't1', displayName: 'Friend' })],
    });
    await container.resolve(TRIP_REPO).saveTrip(trip);
    await store.getState().loadTrips(userId);
    await store.getState().loadGroups(userId);

    const expense = expenseFactory({
      id: 'e1', tripId: 't1', currency: 'EUR',
      totalAmountCents: 4000, paidByUserId: userId,
      splits: [
        splitFactory({ id: 's1', expenseId: 'e1', userId, amountOwedCents: 2000 }),
        splitFactory({ id: 's2', expenseId: 'e1', userId: 'friend', amountOwedCents: 2000 }),
      ],
    });
    await container.resolve(EXPENSE_REPO).saveExpense(expense);
    store.getState().appendExpense(expense);

    render(container);

    await waitFor(() => {
      expect(screen.getByText('Flatmates')).toBeTruthy();
    });
    expect(screen.queryByText('Group Trip')).toBeNull();
  });

  it('shows a group with a zero balance instead of hiding it', async () => {
    const container = createTestContainer();
    const { userId } = await seedHydrated(container);

    const group = groupFactory({
      id: 'g1', name: 'Flatmates', currency: 'EUR', ownerId: userId,
      members: [groupMemberFactory({ userId, groupId: 'g1' })],
    });
    await container.resolve(GROUP_REPO).saveGroup(group);
    await container.resolve(TRIP_STORE).getState().loadGroups(userId);

    render(container);

    await waitFor(() => {
      expect(screen.getByText('Flatmates')).toBeTruthy();
    });
    expect(screen.getAllByText('settled').length).toBeGreaterThanOrEqual(1);
  });
});
