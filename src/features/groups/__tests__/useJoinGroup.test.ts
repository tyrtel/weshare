import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useJoinGroup } from '../hooks/useJoinGroup';
import { ServiceContext } from '../../../core/di/ServiceContext';
import { createTestContainer } from '../../../core/di/testContainer';
import { GROUP_REPO, AUTH } from '../../../core/di/tokens';
import type { ServiceContainer } from '../../../core/di/ServiceContainer';
import type { Group } from '../../../core/models/Group';
import { groupFactory } from '../../../__testUtils__/factories';

function makeWrapper(container: ServiceContainer) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(ServiceContext.Provider, { value: container }, children);
  };
}

// ── Token resolution ──────────────────────────────────────────────────────────

describe('useJoinGroup — token resolution', () => {
  it('loads group details for a valid token', async () => {
    const container = createTestContainer();
    await container.resolve(GROUP_REPO).saveGroup(groupFactory({ inviteToken: 'TESTTOKEN' }));

    const { result } = renderHook(() => useJoinGroup('TESTTOKEN'), { wrapper: makeWrapper(container) });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.group?.name).toBe('Weekend Crew');
    expect(result.current.error).toBeNull();
  });

  it('sets NotFoundError for an invalid token', async () => {
    const container = createTestContainer();

    const { result } = renderHook(() => useJoinGroup('BADTOKEN'), { wrapper: makeWrapper(container) });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.group).toBeNull();
    expect(result.current.error?.kind).toBe('NotFoundError');
  });

  it('sets ValidationError for an empty token', async () => {
    const container = createTestContainer();

    const { result } = renderHook(() => useJoinGroup(''), { wrapper: makeWrapper(container) });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error?.kind).toBe('ValidationError');
  });
});

// ── joinAuthenticated ─────────────────────────────────────────────────────────

describe('useJoinGroup — joinAuthenticated', () => {
  let container: ServiceContainer;

  beforeEach(async () => {
    container = createTestContainer();
    await container.resolve(GROUP_REPO).saveGroup(groupFactory({ inviteToken: 'TESTTOKEN' }));
  });

  it('joins the group with the current signed-in user', async () => {
    const auth = container.resolve(AUTH);
    await auth.signIn('jay@example.com', 'password');

    const { result } = renderHook(() => useJoinGroup('TESTTOKEN'), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let joined: Group | null = null;
    await act(async () => { joined = await result.current.joinAuthenticated(); });

    expect(joined).not.toBeNull();
  });

  it('adds the authenticated user to the group member list', async () => {
    const auth = container.resolve(AUTH);
    const signInResult = await auth.signIn('jay@example.com', 'password');
    const userId = signInResult.ok ? signInResult.value.id : '';

    const { result } = renderHook(() => useJoinGroup('TESTTOKEN'), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.joinAuthenticated(); });

    const group = await container.resolve(GROUP_REPO).getGroup('g1');
    expect(group.ok).toBe(true);
    if (group.ok) {
      expect(group.value.members.some(m => m.userId === userId)).toBe(true);
    }
  });

  it('sets AuthError when no user is signed in', async () => {
    const { result } = renderHook(() => useJoinGroup('TESTTOKEN'), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let joined: unknown = 'not-null';
    await act(async () => { joined = await result.current.joinAuthenticated(); });

    expect(joined).toBeNull();
    expect(result.current.joinError?.kind).toBe('AuthError');
  });
});

// ── Already a member (idempotency) ────────────────────────────────────────────

describe('useJoinGroup — already a member', () => {
  it('joining twice does not add a duplicate member entry', async () => {
    const container = createTestContainer();
    const auth = container.resolve(AUTH);
    await container.resolve(GROUP_REPO).saveGroup(groupFactory({ inviteToken: 'TESTTOKEN' }));
    await auth.signIn('jay@example.com', 'password');

    const { result } = renderHook(() => useJoinGroup('TESTTOKEN'), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.joinAuthenticated(); });
    await act(async () => { await result.current.joinAuthenticated(); });

    const group = await container.resolve(GROUP_REPO).getGroup('g1');
    if (group.ok) {
      const jayCount = group.value.members.filter(m => m.displayName === 'Jay').length;
      expect(jayCount).toBe(1);
    }
  });
});
