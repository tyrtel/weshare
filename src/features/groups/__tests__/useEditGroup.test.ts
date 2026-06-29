import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { useEditGroup } from '../hooks/useEditGroup';
import { ServiceContext } from '../../../core/di/ServiceContext';
import { createTestContainer } from '../../../core/di/testContainer';
import { GROUP_REPO, TRIP_STORE } from '../../../core/di/tokens';
import { InMemoryGroupRepository } from '../../../__mocks__/InMemoryGroupRepository';
import { groupFactory, groupMemberFactory } from '../../../__testUtils__/factories';
import type { ServiceContainer } from '../../../core/di/ServiceContainer';

function makeWrapper(container: ServiceContainer) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(ServiceContext.Provider, { value: container }, children);
  };
}

describe('useEditGroup', () => {
  let container: ServiceContainer;
  let groupRepo: InMemoryGroupRepository;

  const existingGroup = groupFactory({
    id: 'g1',
    name: 'Original',
    currency: 'EUR',
    members: [groupMemberFactory()],
  });

  beforeEach(() => {
    groupRepo = new InMemoryGroupRepository();
    groupRepo.seed([existingGroup]);
    container = createTestContainer({ groupRepo });
    container.resolve(TRIP_STORE).getState().appendGroup(existingGroup);
  });

  it('updates the group name', async () => {
    const { result } = renderHook(() => useEditGroup(), { wrapper: makeWrapper(container) });

    let updated: import('../../../core/models/Group').Group | null = null;
    await act(async () => { updated = await result.current.editGroup(existingGroup, 'Renamed', 'EUR'); });

    expect(updated?.name).toBe('Renamed');
    const stored = await groupRepo.getGroup('g1');
    expect(stored.ok && stored.value.name).toBe('Renamed');
  });

  it('updates the currency', async () => {
    const { result } = renderHook(() => useEditGroup(), { wrapper: makeWrapper(container) });

    let updated: import('../../../core/models/Group').Group | null = null;
    await act(async () => { updated = await result.current.editGroup(existingGroup, 'Original', 'USD'); });

    expect(updated?.currency).toBe('USD');
  });

  it('returns null and ValidationError for empty name', async () => {
    const { result } = renderHook(() => useEditGroup(), { wrapper: makeWrapper(container) });

    let updated: import('../../../core/models/Group').Group | null = null;
    await act(async () => { updated = await result.current.editGroup(existingGroup, '  ', 'EUR'); });

    expect(updated).toBeNull();
    expect(result.current.error?.kind).toBe('ValidationError');
  });

  it('reflects the update in the store', async () => {
    const { result } = renderHook(() => useEditGroup(), { wrapper: makeWrapper(container) });

    await act(async () => { await result.current.editGroup(existingGroup, 'Store Updated', 'EUR'); });

    const state = container.resolve(TRIP_STORE).getState();
    const inStore = state.groups.find(g => g.id === 'g1');
    expect(inStore?.name).toBe('Store Updated');
  });
});
