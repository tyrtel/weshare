import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useJoinGroup } from '../hooks/useJoinGroup';
import { ServiceContext } from '../../../core/di/ServiceContext';
import { createTestContainer } from '../../../core/di/testContainer';
import { GROUP_REPO, AUTH } from '../../../core/di/tokens';
import type { ServiceContainer } from '../../../core/di/ServiceContainer';
import { groupFactory, groupMemberFactory } from '../../../__testUtils__/factories';

const PLACEHOLDER_ID = 'guest_marie';
const GROUP_ID = 'g1';

function makeWrapper(container: ServiceContainer) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(ServiceContext.Provider, { value: container }, children);
  };
}

async function setupWithPlaceholder(email: string): Promise<ServiceContainer> {
  const container = createTestContainer();
  await container.resolve(GROUP_REPO).saveGroup(groupFactory({
    id: GROUP_ID,
    inviteToken: 'TESTTOKEN',
    members: [groupMemberFactory({ userId: PLACEHOLDER_ID, groupId: GROUP_ID, email, isGuest: true, displayName: 'Marie (placeholder)' })],
  }));
  return container;
}

describe('useJoinGroup — email-based member matching', () => {
  it('merges into the placeholder when email matches', async () => {
    const container = await setupWithPlaceholder('marie@example.com');
    const auth = container.resolve(AUTH);
    await auth.signIn('marie@example.com', 'password');

    const { result } = renderHook(() => useJoinGroup('TESTTOKEN'), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.joinAuthenticated(); });

    const group = await container.resolve(GROUP_REPO).getGroup(GROUP_ID);
    expect(group.ok).toBe(true);
    if (!group.ok) return;

    expect(group.value.members).toHaveLength(1);
    const realUserId = auth.currentUser()!.id;
    expect(group.value.members[0].userId).toBe(realUserId);
    expect(group.value.members[0].isGuest).toBe(false);
  });

  it('does not keep the old placeholder userId after merging', async () => {
    const container = await setupWithPlaceholder('marie@example.com');
    const auth = container.resolve(AUTH);
    await auth.signIn('marie@example.com', 'password');

    const { result } = renderHook(() => useJoinGroup('TESTTOKEN'), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.joinAuthenticated(); });

    const group = await container.resolve(GROUP_REPO).getGroup(GROUP_ID);
    if (!group.ok) return;
    expect(group.value.members.some(m => m.userId === PLACEHOLDER_ID)).toBe(false);
  });

  it('adds a new member when no email placeholder exists', async () => {
    const container = createTestContainer();
    await container.resolve(GROUP_REPO).saveGroup(groupFactory({ id: GROUP_ID, inviteToken: 'TESTTOKEN' }));
    const auth = container.resolve(AUTH);
    await auth.signIn('newperson@example.com', 'password');

    const { result } = renderHook(() => useJoinGroup('TESTTOKEN'), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.joinAuthenticated(); });

    const group = await container.resolve(GROUP_REPO).getGroup(GROUP_ID);
    expect(group.ok).toBe(true);
    if (!group.ok) return;
    expect(group.value.members.some(m => m.userId === auth.currentUser()!.id)).toBe(true);
  });

  it('does not claim the placeholder when a different email joins', async () => {
    const container = await setupWithPlaceholder('marie@example.com');
    const auth = container.resolve(AUTH);
    await auth.signIn('other@example.com', 'password');

    const { result } = renderHook(() => useJoinGroup('TESTTOKEN'), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.joinAuthenticated(); });

    const group = await container.resolve(GROUP_REPO).getGroup(GROUP_ID);
    expect(group.ok).toBe(true);
    if (!group.ok) return;

    expect(group.value.members.some(m => m.userId === PLACEHOLDER_ID)).toBe(true);
    expect(group.value.members).toHaveLength(2);
  });

  it('is idempotent when the merged user joins again', async () => {
    const container = await setupWithPlaceholder('marie@example.com');
    const auth = container.resolve(AUTH);
    await auth.signIn('marie@example.com', 'password');

    const { result } = renderHook(() => useJoinGroup('TESTTOKEN'), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.joinAuthenticated(); });
    await act(async () => { await result.current.joinAuthenticated(); });

    const group = await container.resolve(GROUP_REPO).getGroup(GROUP_ID);
    if (!group.ok) return;
    expect(group.value.members).toHaveLength(1);
  });
});
