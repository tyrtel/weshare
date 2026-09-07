import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useJoinTrip } from '../hooks/useJoinTrip';
import { ServiceContext } from '../../../core/di/ServiceContext';
import { createTestContainer } from '../../../core/di/testContainer';
import { TRIP_REPO, MEMBER_REPO, AUTH } from '../../../core/di/tokens';
import type { ServiceContainer } from '../../../core/di/ServiceContainer';
import type { Trip } from '../../../core/models/Trip';
import { tripFactory } from '../../../__testUtils__/factories';
import { InMemoryMemberRepository } from '../../../__mocks__/InMemoryMemberRepository';

function makeWrapper(container: ServiceContainer) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(ServiceContext.Provider, { value: container }, children);
  };
}

const NOW = new Date('2025-06-01T12:00:00Z');

// ── Token resolution ──────────────────────────────────────────────────────────

describe('useJoinTrip — token resolution', () => {
  it('loads trip details for a valid token', async () => {
    const container = createTestContainer();
    await container.resolve(TRIP_REPO).saveTrip(tripFactory({ inviteToken: 'TESTTOKEN' }));

    const { result } = renderHook(() => useJoinTrip('TESTTOKEN'), { wrapper: makeWrapper(container) });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.trip?.name).toBe('Chez Paul');
    expect(result.current.error).toBeNull();
  });

  it('sets NotFoundError for an invalid token', async () => {
    const container = createTestContainer();

    const { result } = renderHook(() => useJoinTrip('BADTOKEN'), { wrapper: makeWrapper(container) });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.trip).toBeNull();
    expect(result.current.error?.kind).toBe('NotFoundError');
  });

  it('sets ValidationError for an empty token', async () => {
    const container = createTestContainer();

    const { result } = renderHook(() => useJoinTrip(''), { wrapper: makeWrapper(container) });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error?.kind).toBe('ValidationError');
  });
});

// ── joinAuthenticated ─────────────────────────────────────────────────────────

describe('useJoinTrip — joinAuthenticated', () => {
  let container: ServiceContainer;

  beforeEach(async () => {
    container = createTestContainer();
    await container.resolve(TRIP_REPO).saveTrip(tripFactory({ inviteToken: 'TESTTOKEN' }));
  });

  it('joins the trip with the current signed-in user', async () => {
    const auth = container.resolve(AUTH);
    await auth.signIn('jay@example.com', 'password');

    const { result } = renderHook(() => useJoinTrip('TESTTOKEN'), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let joined: Trip | null = null;
    await act(async () => { joined = await result.current.joinAuthenticated(); });

    expect(joined).not.toBeNull();
  });

  it('adds the authenticated user to the trip member list', async () => {
    const auth       = container.resolve(AUTH);
    const memberRepo = container.resolve(MEMBER_REPO);
    const signInResult = await auth.signIn('jay@example.com', 'password');
    const userId = signInResult.ok ? signInResult.value.id : '';

    const { result } = renderHook(() => useJoinTrip('TESTTOKEN'), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.joinAuthenticated(); });

    const members = await memberRepo.getMembersForTrip('t1');
    expect(members.ok).toBe(true);
    if (members.ok) {
      expect(members.value.some(m => m.userId === userId)).toBe(true);
    }
  });

  it('sets AuthError when no user is signed in', async () => {
    const { result } = renderHook(() => useJoinTrip('TESTTOKEN'), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let joined: unknown = 'not-null';
    await act(async () => { joined = await result.current.joinAuthenticated(); });

    expect(joined).toBeNull();
    expect(result.current.joinError?.kind).toBe('AuthError');
  });
});

// ── Already a member (idempotency) ────────────────────────────────────────────

describe('useJoinTrip — already a member', () => {
  it('joining twice does not add a duplicate member entry', async () => {
    const container = createTestContainer();
    const auth      = container.resolve(AUTH);
    await container.resolve(TRIP_REPO).saveTrip(tripFactory({ inviteToken: 'TESTTOKEN' }));
    await auth.signIn('jay@example.com', 'password');

    const { result } = renderHook(() => useJoinTrip('TESTTOKEN'), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.joinAuthenticated(); });
    await act(async () => { await result.current.joinAuthenticated(); });

    const members = await container.resolve(MEMBER_REPO).getMembersForTrip('t1');
    if (members.ok) {
      const jayCount = members.value.filter(m => m.displayName === 'Jay').length;
      expect(jayCount).toBe(1);
    }
  });

  it('returns the trip without error when already a member', async () => {
    const container = createTestContainer();
    const auth      = container.resolve(AUTH);

    await auth.signIn('jay@example.com', 'password');
    const user = auth.currentUser()!;

    await container.resolve(TRIP_REPO).saveTrip(tripFactory({ inviteToken: 'TESTTOKEN' }));
    await container.resolve(MEMBER_REPO).addMember({
      userId: user.id,
      tripId: 't1',
      displayName: user.name,
      isGuest: false,
      joinedAt: NOW,
    });

    const { result } = renderHook(() => useJoinTrip('TESTTOKEN'), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let joined: Trip | null = null;
    await act(async () => { joined = await result.current.joinAuthenticated(); });

    expect(joined).not.toBeNull();
    expect(result.current.joinError).toBeNull();
  });
});

// Regression coverage, same class of bug as useAddExpense/useEditExpense:
// joinAuthenticated had no try/catch, so a thrown exception (a real network
// failure, distinct from a repo returning Result.err) left `joining` stuck at
// true forever and skipped the caller's post-join navigation entirely.
describe('useJoinTrip — exception safety', () => {
  it('resets joining and sets a NetworkError when addMember throws, instead of hanging forever', async () => {
    const memberRepo = new InMemoryMemberRepository();
    memberRepo.addMember = async () => { throw new Error('fetch failed'); };
    const container = createTestContainer({ memberRepo });
    await container.resolve(TRIP_REPO).saveTrip(tripFactory({ inviteToken: 'TESTTOKEN' }));
    const auth = container.resolve(AUTH);
    await auth.signIn('jay@example.com', 'password');

    const { result } = renderHook(() => useJoinTrip('TESTTOKEN'), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let joined: unknown = 'not-null';
    await act(async () => { joined = await result.current.joinAuthenticated(); });

    expect(joined).toBeNull();
    expect(result.current.joining).toBe(false);
    expect(result.current.joinError?.kind).toBe('NetworkError');
  });
});
