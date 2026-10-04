jest.mock('expo-router', () => ({
  useFocusEffect: (cb: Parameters<typeof import('react').useEffect>[0]) => {
    const { useEffect } = require('react');
    useEffect(cb, [cb]);
  },
}));

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { useExpenseActivityFeed } from '../useExpenseActivityFeed';
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

function makeEvent(id: string, eventType: string, expenseId: string, createdAt: Date): ActivityEvent {
  return {
    id, eventType, entityType: 'expense', entityId: expenseId,
    groupId: 'g1', tripId: null, expenseId, actorUserId: 'u1',
    payload: null, createdAt,
  };
}

describe('useExpenseActivityFeed', () => {
  it('returns the full history for one expense in reverse-chronological order', async () => {
    const container = createTestContainer();
    const activityLog = container.resolve(ACTIVITY_LOG);
    await activityLog.appendEvent(makeEvent('e1', 'expense.created', 'exp1', new Date('2026-09-01T10:00:00Z')));
    await activityLog.appendEvent(makeEvent('e2', 'expense.updated', 'exp1', new Date('2026-09-01T11:00:00Z')));
    await activityLog.appendEvent(makeEvent('e3', 'expense.created', 'other', new Date('2026-09-01T12:00:00Z')));

    const { result } = renderHook(() => useExpenseActivityFeed('exp1'), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.events.map(e => e.id)).toEqual(['e2', 'e1']);
  });
});
