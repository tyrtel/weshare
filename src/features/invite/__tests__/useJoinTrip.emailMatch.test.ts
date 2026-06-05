import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useJoinTrip } from '../hooks/useJoinTrip';
import { ServiceContext } from '../../../core/di/ServiceContext';
import { createTestContainer } from '../../../core/di/testContainer';
import { TRIP_REPO, MEMBER_REPO, AUTH } from '../../../core/di/tokens';
import type { ServiceContainer } from '../../../core/di/ServiceContainer';
import { tripFactory, memberFactory } from '../../../__testUtils__/factories';

const PLACEHOLDER_ID = 'placeholder_marie';
const TRIP_ID = 't1';

function makeWrapper(container: ServiceContainer) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(ServiceContext.Provider, { value: container }, children);
  };
}

async function setupWithPlaceholder(email: string): Promise<ServiceContainer> {
  const container = createTestContainer();
  await container.resolve(TRIP_REPO).saveTrip(tripFactory({ inviteToken: 'TESTTOKEN' }));
  await container.resolve(MEMBER_REPO).addMember(
    memberFactory({ userId: PLACEHOLDER_ID, tripId: TRIP_ID, email, displayName: 'Marie (placeholder)' }),
  );
  return container;
}

// ── Email match → claimMemberSlot ─────────────────────────────────────────────

describe('useJoinTrip — email-based participant matching', () => {
  it('merges into the placeholder when email matches', async () => {
    const container = await setupWithPlaceholder('marie@example.com');
    const auth = container.resolve(AUTH);
    // Sign in as an authenticated user whose email matches the placeholder
    await auth.signIn('marie@example.com', 'password');

    const { result } = renderHook(() => useJoinTrip('TESTTOKEN'), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.joinAuthenticated(); });

    const members = await container.resolve(MEMBER_REPO).getMembersForTrip(TRIP_ID);
    expect(members.ok).toBe(true);
    if (!members.ok) return;

    // Should still be one row (the placeholder was claimed, not duplicated)
    expect(members.value.length).toBe(1);

    // The row's userId should be the real user's id
    const realUserId = auth.currentUser()!.id;
    expect(members.value[0].userId).toBe(realUserId);
    expect(members.value[0].isGuest).toBe(false);
  });

  it('does not keep the old placeholder userId after merging', async () => {
    const container = await setupWithPlaceholder('marie@example.com');
    const auth = container.resolve(AUTH);
    await auth.signIn('marie@example.com', 'password');

    const { result } = renderHook(() => useJoinTrip('TESTTOKEN'), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.joinAuthenticated(); });

    const members = await container.resolve(MEMBER_REPO).getMembersForTrip(TRIP_ID);
    if (!members.ok) return;
    expect(members.value.some(m => m.userId === PLACEHOLDER_ID)).toBe(false);
  });

  it('adds a new member when no email placeholder exists', async () => {
    const container = createTestContainer();
    await container.resolve(TRIP_REPO).saveTrip(tripFactory({ inviteToken: 'TESTTOKEN' }));
    const auth = container.resolve(AUTH);
    await auth.signIn('newperson@example.com', 'password');

    const { result } = renderHook(() => useJoinTrip('TESTTOKEN'), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.joinAuthenticated(); });

    const members = await container.resolve(MEMBER_REPO).getMembersForTrip(TRIP_ID);
    expect(members.ok).toBe(true);
    if (!members.ok) return;
    expect(members.value.some(m => m.userId === auth.currentUser()!.id)).toBe(true);
  });

  it('does not attempt email matching for guest users', async () => {
    const container = await setupWithPlaceholder('marie@example.com');
    // Join as guest (no email) — should add a new row, not claim the placeholder
    const { result } = renderHook(() => useJoinTrip('TESTTOKEN'), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.joinAsGuest('Marie'); });

    const members = await container.resolve(MEMBER_REPO).getMembersForTrip(TRIP_ID);
    expect(members.ok).toBe(true);
    if (!members.ok) return;

    // Placeholder still exists with original userId
    expect(members.value.some(m => m.userId === PLACEHOLDER_ID)).toBe(true);
    // Guest was added as a new row
    expect(members.value.length).toBe(2);
  });

  it('is idempotent when the merged user joins again', async () => {
    const container = await setupWithPlaceholder('marie@example.com');
    const auth = container.resolve(AUTH);
    await auth.signIn('marie@example.com', 'password');

    const { result } = renderHook(() => useJoinTrip('TESTTOKEN'), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    // First join — merges into placeholder
    await act(async () => { await result.current.joinAuthenticated(); });
    // Second join — should be idempotent (already a member by userId)
    await act(async () => { await result.current.joinAuthenticated(); });

    const members = await container.resolve(MEMBER_REPO).getMembersForTrip(TRIP_ID);
    if (!members.ok) return;
    expect(members.value.length).toBe(1);
  });
});
