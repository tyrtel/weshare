import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { useDeleteGroup } from '../hooks/useDeleteGroup';
import { ServiceContext } from '../../../core/di/ServiceContext';
import { createTestContainer } from '../../../core/di/testContainer';
import { TRIP_STORE } from '../../../core/di/tokens';
import { InMemoryGroupRepository } from '../../../__mocks__/InMemoryGroupRepository';
import { groupFactory, groupMemberFactory } from '../../../__testUtils__/factories';
import type { ServiceContainer } from '../../../core/di/ServiceContainer';

function makeWrapper(container: ServiceContainer) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(ServiceContext.Provider, { value: container }, children);
  };
}

describe('useDeleteGroup', () => {
  let container: ServiceContainer;
  let groupRepo: InMemoryGroupRepository;

  const group = groupFactory({ id: 'g1', members: [groupMemberFactory()] });

  beforeEach(() => {
    groupRepo = new InMemoryGroupRepository();
    groupRepo.seed([group]);
    container = createTestContainer({ groupRepo });
    container.resolve(TRIP_STORE).getState().appendGroup(group);
  });

  it('deletes the group and returns true', async () => {
    const { result } = renderHook(() => useDeleteGroup(), { wrapper: makeWrapper(container) });

    let ok = false;
    await act(async () => { ok = await result.current.deleteGroup('g1'); });

    expect(ok).toBe(true);
    const stored = await groupRepo.getGroup('g1');
    expect(stored.ok).toBe(false);
  });

  it('removes the group from the store', async () => {
    const { result } = renderHook(() => useDeleteGroup(), { wrapper: makeWrapper(container) });

    await act(async () => { await result.current.deleteGroup('g1'); });

    const state = container.resolve(TRIP_STORE).getState();
    expect(state.groups.find(g => g.id === 'g1')).toBeUndefined();
  });

  it('returns false for a missing group id', async () => {
    const { result } = renderHook(() => useDeleteGroup(), { wrapper: makeWrapper(container) });

    let ok = true;
    await act(async () => { ok = await result.current.deleteGroup('nonexistent'); });

    expect(ok).toBe(false);
  });

  it('loading is false initially', () => {
    const { result } = renderHook(() => useDeleteGroup(), { wrapper: makeWrapper(container) });
    expect(result.current.loading).toBe(false);
  });
});
