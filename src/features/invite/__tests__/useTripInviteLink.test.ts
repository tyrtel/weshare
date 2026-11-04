import React from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { useTripInviteLink } from '../hooks/useTripInviteLink';
import { useGroupInviteLink } from '../../groups/hooks/useGroupInviteLink';
import { ServiceContext } from '../../../core/di/ServiceContext';
import type { ServiceContainer } from '../../../core/di/ServiceContainer';
import { createTestContainer } from '../../../core/di/testContainer';
import { GROUP_REPO, TRIP_REPO, TRIP_STORE } from '../../../core/di/tokens';
import { groupFactory, tripFactory } from '../../../__testUtils__/factories';
import { InMemoryTripRepository } from '../../../__mocks__/InMemoryTripRepository';

function renderHookWithContainer<T>(hook: () => T, container: ServiceContainer) {
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(ServiceContext.Provider, { value: container }, children);
  return renderHook(hook, { wrapper });
}

describe('useTripInviteLink', () => {
  async function setup() {
    const container = createTestContainer();
    const saved = await container.resolve(TRIP_REPO).saveTrip(tripFactory({ id: 't1', inviteToken: 'OLDTOKEN' }));
    if (!saved.ok) throw new Error('seed failed');
    container.resolve(TRIP_STORE).getState().appendTrip(saved.value);
    const { result } = renderHookWithContainer(() => useTripInviteLink('t1'), container);
    const storeTrip = () => container.resolve(TRIP_STORE).getState().trips.find(t => t.id === 't1')!;
    return { result, storeTrip };
  }

  it('changes the lifetime and updates the trip in the store', async () => {
    const { result, storeTrip } = await setup();
    await act(async () => { await result.current.setTtl(null); });
    expect(storeTrip().inviteTtlHours).toBeNull();
  });

  it('resets the token and updates the trip in the store', async () => {
    const { result, storeTrip } = await setup();
    await act(async () => { await result.current.reset(); });
    expect(storeTrip().inviteToken).not.toBe('OLDTOKEN');
  });

  it('surfaces a repository error and clears busy', async () => {
    const tripRepo = new InMemoryTripRepository();
    const container = createTestContainer({ tripRepo });
    const { result } = renderHookWithContainer(() => useTripInviteLink('missing'), container);

    let ok = true;
    await act(async () => { ok = await result.current.reset(); });

    expect(ok).toBe(false);
    expect(result.current.error?.kind).toBe('NotFoundError');
    expect(result.current.busy).toBe(false);
  });
});

describe('useGroupInviteLink', () => {
  it('changes the lifetime and updates the group in the store', async () => {
    const container = createTestContainer();
    const saved = await container.resolve(GROUP_REPO).saveGroup(groupFactory({ id: 'g1' }));
    if (!saved.ok) throw new Error('seed failed');
    container.resolve(TRIP_STORE).getState().appendGroup(saved.value);
    const { result } = renderHookWithContainer(() => useGroupInviteLink('g1'), container);

    await act(async () => { await result.current.setTtl(24); });

    expect(container.resolve(TRIP_STORE).getState().groups.find(g => g.id === 'g1')!.inviteTtlHours).toBe(24);
  });
});
