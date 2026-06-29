import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { useCreateGroup } from '../hooks/useCreateGroup';
import { ServiceContext } from '../../../core/di/ServiceContext';
import { createTestContainer } from '../../../core/di/testContainer';
import { AUTH, GROUP_REPO } from '../../../core/di/tokens';
import type { ServiceContainer } from '../../../core/di/ServiceContainer';

function makeWrapper(container: ServiceContainer) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(ServiceContext.Provider, { value: container }, children);
  };
}

describe('useCreateGroup', () => {
  let container: ServiceContainer;

  beforeEach(() => {
    container = createTestContainer();
  });

  it('returns null and AuthError when not signed in', async () => {
    const { result } = renderHook(() => useCreateGroup(), { wrapper: makeWrapper(container) });

    let group: import('../../../core/models/Group').Group | null = null;
    await act(async () => { group = await result.current.createGroup('Weekend Crew', 'EUR'); });

    expect(group).toBeNull();
    expect(result.current.error?.kind).toBe('AuthError');
  });

  it('returns null and ValidationError for empty name', async () => {
    const auth = container.resolve(AUTH);
    await auth.signIn('jay@example.com', 'password');

    const { result } = renderHook(() => useCreateGroup(), { wrapper: makeWrapper(container) });

    let group: import('../../../core/models/Group').Group | null = null;
    await act(async () => { group = await result.current.createGroup('  ', 'EUR'); });

    expect(group).toBeNull();
    expect(result.current.error?.kind).toBe('ValidationError');
  });

  it('creates and returns a group', async () => {
    const auth = container.resolve(AUTH);
    await auth.signIn('jay@example.com', 'password');

    const { result } = renderHook(() => useCreateGroup(), { wrapper: makeWrapper(container) });

    let group: import('../../../core/models/Group').Group | null = null;
    await act(async () => { group = await result.current.createGroup('Weekend Crew', 'GBP'); });

    expect(group).not.toBeNull();
    expect(group?.name).toBe('Weekend Crew');
    expect(group?.currency).toBe('GBP');
  });

  it('trims whitespace from the name', async () => {
    const auth = container.resolve(AUTH);
    await auth.signIn('jay@example.com', 'password');

    const { result } = renderHook(() => useCreateGroup(), { wrapper: makeWrapper(container) });

    let group: import('../../../core/models/Group').Group | null = null;
    await act(async () => { group = await result.current.createGroup('  Road Crew  ', 'USD'); });

    expect(group?.name).toBe('Road Crew');
  });

  it('adds the owner as the sole member', async () => {
    const auth = container.resolve(AUTH);
    const authResult = await auth.signIn('sara@example.com', 'password');
    const userId = authResult.ok ? authResult.value.id : '';

    const { result } = renderHook(() => useCreateGroup(), { wrapper: makeWrapper(container) });

    let group: import('../../../core/models/Group').Group | null = null;
    await act(async () => { group = await result.current.createGroup('Dinner Club', 'EUR'); });

    expect(group?.members).toHaveLength(1);
    expect(group?.members[0].userId).toBe(userId);
  });

  it('persists the group in storage', async () => {
    const auth = container.resolve(AUTH);
    await auth.signIn('jay@example.com', 'password');
    const groupRepo = container.resolve(GROUP_REPO);

    const { result } = renderHook(() => useCreateGroup(), { wrapper: makeWrapper(container) });

    let group: import('../../../core/models/Group').Group | null = null;
    await act(async () => { group = await result.current.createGroup('Book Club', 'EUR'); });

    const fetched = await groupRepo.getGroup(group!.id);
    expect(fetched.ok).toBe(true);
    if (fetched.ok) expect(fetched.value.name).toBe('Book Club');
  });

  it('generates an inviteToken on the created group', async () => {
    const auth = container.resolve(AUTH);
    await auth.signIn('jay@example.com', 'password');

    const { result } = renderHook(() => useCreateGroup(), { wrapper: makeWrapper(container) });

    let group: import('../../../core/models/Group').Group | null = null;
    await act(async () => { group = await result.current.createGroup('Test', 'EUR'); });

    expect(group?.inviteToken).toBeTruthy();
  });

  it('loading is false initially', () => {
    const { result } = renderHook(() => useCreateGroup(), { wrapper: makeWrapper(container) });
    expect(result.current.loading).toBe(false);
  });

  it('error is null initially', () => {
    const { result } = renderHook(() => useCreateGroup(), { wrapper: makeWrapper(container) });
    expect(result.current.error).toBeNull();
  });
});
