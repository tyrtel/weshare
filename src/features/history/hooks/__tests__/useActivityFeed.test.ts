jest.mock('expo-router', () => ({
  useFocusEffect: (cb: Parameters<typeof import('react').useEffect>[0]) => {
    const { useEffect } = require('react');
    useEffect(cb, [cb]);
  },
}));

import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { useActivityFeed } from '../useActivityFeed';
import { ServiceContext } from '../../../../core/di/ServiceContext';
import { createTestContainer } from '../../../../core/di/testContainer';
import { AUTH, TRIP_REPO, ACTIVITY_LOG, GROUP_REPO } from '../../../../core/di/tokens';
import type { InMemoryGroupRepository } from '../../../../__mocks__/InMemoryGroupRepository';
import { tripFactory, groupFactory, groupMemberFactory } from '../../../../__testUtils__/factories';
import type { ServiceContainer } from '../../../../core/di/ServiceContainer';
import type { ActivityEvent } from '../../../../core/models/ActivityEvent';

function makeWrapper(container: ServiceContainer) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(ServiceContext.Provider, { value: container }, children);
  };
}

function makeEvent(id: string, overrides: Partial<ActivityEvent>, createdAt: Date): ActivityEvent {
  return {
    id, eventType: 'expense.created', entityType: 'expense', entityId: 'exp',
    groupId: null, tripId: null, expenseId: 'exp', actorUserId: 'u1',
    payload: null, createdAt, ...overrides,
  };
}

describe('useActivityFeed', () => {
  it('merges and sorts events from every group and trip the user belongs to', async () => {
    const container = createTestContainer();
    const auth = container.resolve(AUTH);
    const res  = await auth.signIn('jay@example.com', 'password');
    const userId = res.ok ? res.value.id : '';

    await container.resolve(TRIP_REPO).saveTrip(tripFactory({ id: 't1', ownerId: userId, closedAt: null }));
    const group = groupFactory({ id: 'g1', members: [groupMemberFactory({ userId })] });
    (container.resolve(GROUP_REPO) as InMemoryGroupRepository).seed([group]);

    const activityLog = container.resolve(ACTIVITY_LOG);
    await activityLog.appendEvent(makeEvent('older', { tripId: 't1' }, new Date('2026-09-01T09:00:00Z')));
    await activityLog.appendEvent(makeEvent('newer', { groupId: 'g1' }, new Date('2026-09-01T11:00:00Z')));

    const { result } = renderHook(() => useActivityFeed(), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.events.map(e => e.id)).toEqual(['newer', 'older']);
  });

  it('returns an empty feed when the user has no groups or trips', async () => {
    const container = createTestContainer();
    const auth = container.resolve(AUTH);
    await auth.signIn('jay@example.com', 'password');

    const { result } = renderHook(() => useActivityFeed(), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.events).toEqual([]);
    expect(result.current.hasMore).toBe(false);
  });

  it('loadMore fetches the next page via the cursor the repository returned', async () => {
    const container = createTestContainer();
    const auth = container.resolve(AUTH);
    const res  = await auth.signIn('jay@example.com', 'password');
    const userId = res.ok ? res.value.id : '';

    await container.resolve(TRIP_REPO).saveTrip(tripFactory({ id: 't1', ownerId: userId, closedAt: null }));
    const activityLog = container.resolve(ACTIVITY_LOG);
    for (let i = 0; i < 35; i++) {
      await activityLog.appendEvent(makeEvent(`e${i}`, { tripId: 't1' }, new Date(2026, 8, 1, 0, i)));
    }

    const { result } = renderHook(() => useActivityFeed(), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.events).toHaveLength(30); // DEFAULT_LIMIT
    expect(result.current.hasMore).toBe(true);

    act(() => { result.current.loadMore(); });
    await waitFor(() => expect(result.current.events).toHaveLength(35));
    expect(result.current.hasMore).toBe(false);
  });

  it('only surfaces events from groups/trips the user actually belongs to', async () => {
    const container = createTestContainer();
    const auth = container.resolve(AUTH);
    const res  = await auth.signIn('jay@example.com', 'password');
    const userId = res.ok ? res.value.id : '';

    await container.resolve(TRIP_REPO).saveTrip(tripFactory({ id: 't1', ownerId: userId, closedAt: null }));
    const activityLog = container.resolve(ACTIVITY_LOG);
    await activityLog.appendEvent(makeEvent('mine', { tripId: 't1' }, new Date('2026-09-01T10:00:00Z')));
    await activityLog.appendEvent(makeEvent('not-mine', { tripId: 'someone-elses-trip' }, new Date('2026-09-01T11:00:00Z')));

    const { result } = renderHook(() => useActivityFeed(), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.events.map(e => e.id)).toEqual(['mine']);
  });
});
