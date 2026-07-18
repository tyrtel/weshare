import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { useGroups } from '../hooks/useGroups';
import { ServiceContext } from '../../../core/di/ServiceContext';
import { createTestContainer } from '../../../core/di/testContainer';
import { AUTH, TRIP_STORE, EXPENSE_REPO } from '../../../core/di/tokens';
import { groupFactory, groupMemberFactory, tripFactory, expenseFactory, splitFactory } from '../../../__testUtils__/factories';
import type { ServiceContainer } from '../../../core/di/ServiceContainer';

function makeWrapper(container: ServiceContainer) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(ServiceContext.Provider, { value: container }, children);
  };
}

describe('useGroups', () => {
  let container: ServiceContainer;

  beforeEach(() => {
    container = createTestContainer();
  });

  it('returns empty groups when not signed in', () => {
    const { result } = renderHook(() => useGroups(), { wrapper: makeWrapper(container) });
    expect(result.current.groups).toEqual([]);
  });

  it('returns store groups when signed in', async () => {
    const auth = container.resolve(AUTH);
    await auth.signIn('jay@example.com', 'password');

    const group = groupFactory({ members: [groupMemberFactory()] });
    container.resolve(TRIP_STORE).getState().appendGroup(group);

    const { result } = renderHook(() => useGroups(), { wrapper: makeWrapper(container) });
    expect(result.current.groups).toHaveLength(1);
    expect(result.current.groups[0].id).toBe(group.id);
  });

  it('counts active trips per group', async () => {
    const auth = container.resolve(AUTH);
    await auth.signIn('jay@example.com', 'password');

    const group = groupFactory({ id: 'g1', members: [groupMemberFactory()] });
    const trip1 = tripFactory({ id: 't1', groupId: 'g1', status: 'open' });
    const trip2 = tripFactory({ id: 't2', groupId: 'g1', status: 'closed' });
    const trip3 = tripFactory({ id: 't3', groupId: 'g1', status: 'open' });

    const store = container.resolve(TRIP_STORE).getState();
    store.appendGroup(group);
    store.appendTrip(trip1);
    store.appendTrip(trip2);
    store.appendTrip(trip3);

    const { result } = renderHook(() => useGroups(), { wrapper: makeWrapper(container) });
    expect(result.current.groupTripCounts['g1']).toBe(2);
  });

  it('does not count trips belonging to other groups', async () => {
    const auth = container.resolve(AUTH);
    await auth.signIn('jay@example.com', 'password');

    const group = groupFactory({ id: 'g1', members: [groupMemberFactory()] });
    const trip  = tripFactory({ id: 't1', groupId: 'g2', status: 'open' });

    const store = container.resolve(TRIP_STORE).getState();
    store.appendGroup(group);
    store.appendTrip(trip);

    const { result } = renderHook(() => useGroups(), { wrapper: makeWrapper(container) });
    expect(result.current.groupTripCounts['g1'] ?? 0).toBe(0);
  });

  // Regression: groupSummaries used to only reflect a group's trip-derived
  // expenses on first render — its own standalone (non-trip) expenses only
  // showed up after visiting the group's detail screen once (which is what
  // actually calls loadGroupDetail), so the home screen's balance pill under-
  // counted until then.
  it('reflects a group\'s own standalone expenses without requiring a prior visit to its detail screen', async () => {
    const auth = container.resolve(AUTH);
    await auth.signIn('jay@example.com', 'password');
    const userId = auth.currentUser()!.id;

    const group = groupFactory({
      id: 'g1', currency: 'EUR',
      members: [groupMemberFactory({ userId, groupId: 'g1' }), groupMemberFactory({ userId: 'u2', groupId: 'g1' })],
    });
    container.resolve(TRIP_STORE).getState().appendGroup(group);

    const expense = expenseFactory({
      id: 'e1', tripId: undefined, groupId: 'g1', totalAmountCents: 4000, currency: 'EUR', paidByUserId: 'u2',
      splits: [
        splitFactory({ id: 's1', expenseId: 'e1', userId, amountOwedCents: 2000 }),
        splitFactory({ id: 's2', expenseId: 'e1', userId: 'u2', amountOwedCents: 2000 }),
      ],
    });
    await container.resolve(EXPENSE_REPO).saveExpense(expense);

    const { result } = renderHook(() => useGroups(), { wrapper: makeWrapper(container) });

    await waitFor(() => {
      expect(result.current.groupSummaries['g1']).toEqual({ direction: 'owe', amountCents: 2000, currency: 'EUR' });
    });
  });
});
