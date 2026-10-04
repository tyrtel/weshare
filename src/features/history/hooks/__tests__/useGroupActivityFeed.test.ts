jest.mock('expo-router', () => ({
  useFocusEffect: (cb: Parameters<typeof import('react').useEffect>[0]) => {
    const { useEffect } = require('react');
    useEffect(cb, [cb]);
  },
}));

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { useGroupActivityFeed } from '../useGroupActivityFeed';
import { ServiceContext } from '../../../../core/di/ServiceContext';
import { createTestContainer } from '../../../../core/di/testContainer';
import { ACTIVITY_LOG } from '../../../../core/di/tokens';
import type { ServiceContainer } from '../../../../core/di/ServiceContainer';
import type { ActivityEvent } from '../../../../core/models/ActivityEvent';

function makeWrapper(container: ServiceContainer) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(ServiceContext.Provider, { value: container }, children);
  };
}

function makeEvent(id: string, groupId: string): ActivityEvent {
  return {
    id, eventType: 'expense.created', entityType: 'expense', entityId: 'exp1',
    groupId, tripId: null, expenseId: 'exp1', actorUserId: 'u1',
    payload: null, createdAt: new Date(),
  };
}

describe('useGroupActivityFeed', () => {
  it('only returns events scoped to the given group', async () => {
    const container = createTestContainer();
    const activityLog = container.resolve(ACTIVITY_LOG);
    await activityLog.appendEvent(makeEvent('e1', 'g1'));
    await activityLog.appendEvent(makeEvent('e2', 'g2'));

    const { result } = renderHook(() => useGroupActivityFeed('g1'), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.events.map(e => e.id)).toEqual(['e1']);
  });

  it('returns an empty feed for a group with no activity', async () => {
    const container = createTestContainer();
    const { result } = renderHook(() => useGroupActivityFeed('g1'), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.events).toEqual([]);
  });
});
