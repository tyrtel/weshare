import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { useAddGroupMember } from '../hooks/useAddGroupMember';
import { ServiceContext } from '../../../core/di/ServiceContext';
import { createTestContainer } from '../../../core/di/testContainer';
import { GROUP_REPO, TRIP_STORE } from '../../../core/di/tokens';
import { groupFactory } from '../../../__testUtils__/factories';
import type { ServiceContainer } from '../../../core/di/ServiceContainer';

function makeWrapper(container: ServiceContainer) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(ServiceContext.Provider, { value: container }, children);
  };
}

describe('useAddGroupMember', () => {
  let container: ServiceContainer;
  const GROUP_ID = 'g1';

  beforeEach(() => {
    container = createTestContainer();
    const group = groupFactory({ id: GROUP_ID, members: [] });
    container.resolve(GROUP_REPO).seed([group]);
    container.resolve(TRIP_STORE).getState().appendGroup(group);
  });

  it('returns null and ValidationError when name is empty', async () => {
    const { result } = renderHook(() => useAddGroupMember(GROUP_ID), { wrapper: makeWrapper(container) });

    let saved: import('../../../core/models/GroupMember').GroupMember | null = null;
    await act(async () => { saved = await result.current.addMember({ displayName: '  ' }); });

    expect(saved).toBeNull();
    expect(result.current.error?.kind).toBe('ValidationError');
  });

  it('saves a guest member via the repo and updates the store', async () => {
    const { result } = renderHook(() => useAddGroupMember(GROUP_ID), { wrapper: makeWrapper(container) });

    let saved: import('../../../core/models/GroupMember').GroupMember | null = null;
    await act(async () => { saved = await result.current.addMember({ displayName: 'Alice' }); });

    expect(saved).not.toBeNull();
    expect(saved!.displayName).toBe('Alice');
    expect(saved!.isGuest).toBe(true);
    expect(saved!.groupId).toBe(GROUP_ID);
    expect(saved!.userId).toMatch(/^guest_/);
  });

  it('reflects the new member in the store immediately', async () => {
    const { result } = renderHook(() => useAddGroupMember(GROUP_ID), { wrapper: makeWrapper(container) });

    await act(async () => { await result.current.addMember({ displayName: 'Bob' }); });

    const store = container.resolve(TRIP_STORE).getState();
    const group = store.groups.find(g => g.id === GROUP_ID)!;
    expect(group.members).toHaveLength(1);
    expect(group.members[0].displayName).toBe('Bob');
  });

  it('persists optional email and phone', async () => {
    const { result } = renderHook(() => useAddGroupMember(GROUP_ID), { wrapper: makeWrapper(container) });

    let saved: import('../../../core/models/GroupMember').GroupMember | null = null;
    await act(async () => {
      saved = await result.current.addMember({ displayName: 'Carol', email: 'carol@example.com', phone: '+33612345678' });
    });

    expect(saved!.email).toBe('carol@example.com');
    expect(saved!.phone).toBe('+33612345678');
  });

  it('returns null and sets error when repo fails', async () => {
    container.resolve(GROUP_REPO).seed([]);
    const { result } = renderHook(() => useAddGroupMember('does-not-exist'), { wrapper: makeWrapper(container) });

    let saved: import('../../../core/models/GroupMember').GroupMember | null = null;
    await act(async () => { saved = await result.current.addMember({ displayName: 'Dave' }); });

    expect(saved).toBeNull();
    expect(result.current.error?.kind).toBe('NotFoundError');
  });
});
