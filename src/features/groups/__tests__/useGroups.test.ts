import React from 'react';
import { renderHook } from '@testing-library/react-native';
import { useGroups } from '../hooks/useGroups';
import { ServiceContext } from '../../../core/di/ServiceContext';
import { createTestContainer } from '../../../core/di/testContainer';
import { AUTH, TRIP_STORE } from '../../../core/di/tokens';
import { groupFactory, groupMemberFactory, tripFactory } from '../../../__testUtils__/factories';
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
});
