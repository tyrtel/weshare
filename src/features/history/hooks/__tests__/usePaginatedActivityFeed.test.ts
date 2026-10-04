jest.mock('expo-router', () => ({
  useFocusEffect: (cb: Parameters<typeof import('react').useEffect>[0]) => {
    const { useEffect } = require('react');
    useEffect(cb, [cb]);
  },
}));

import { renderHook, waitFor, act } from '@testing-library/react-native';
import { usePaginatedActivityFeed } from '../usePaginatedActivityFeed';
import { ok, err } from '../../../../core/types/Result';
import type { ActivityFeedPage, ActivityFeedQuery } from '../../../../core/interfaces/IActivityLogRepository';
import type { ActivityEvent } from '../../../../core/models/ActivityEvent';

function makeEvent(id: string, createdAt: Date): ActivityEvent {
  return {
    id, eventType: 'expense.created', entityType: 'expense', entityId: 'exp1',
    groupId: 'g1', tripId: null, expenseId: 'exp1', actorUserId: 'u1',
    payload: null, createdAt,
  };
}

const T1 = new Date('2026-09-01T10:00:00Z');
const T2 = new Date('2026-09-01T09:00:00Z');
const T3 = new Date('2026-09-01T08:00:00Z');

describe('usePaginatedActivityFeed', () => {
  it('loads the first page on mount', async () => {
    const page: ActivityFeedPage = { events: [makeEvent('e1', T1)], nextCursor: null };
    const fetchPage = jest.fn().mockResolvedValue(ok(page));

    const { result } = renderHook(() => usePaginatedActivityFeed(fetchPage));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.events.map(e => e.id)).toEqual(['e1']);
    expect(result.current.hasMore).toBe(false);
    expect(fetchPage).toHaveBeenCalledWith({});
  });

  it('loadMore appends the next page using the returned cursor', async () => {
    const firstPage: ActivityFeedPage = { events: [makeEvent('e1', T1)], nextCursor: T1 };
    const secondPage: ActivityFeedPage = { events: [makeEvent('e2', T2)], nextCursor: null };
    const fetchPage = jest.fn()
      .mockResolvedValueOnce(ok(firstPage))
      .mockResolvedValueOnce(ok(secondPage));

    const { result } = renderHook(() => usePaginatedActivityFeed(fetchPage));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasMore).toBe(true);

    await act(async () => { result.current.loadMore(); });

    expect(result.current.events.map(e => e.id)).toEqual(['e1', 'e2']);
    expect(result.current.hasMore).toBe(false);
    expect(fetchPage).toHaveBeenLastCalledWith({ before: T1 } as ActivityFeedQuery);
  });

  it('loadMore is a no-op once hasMore is false', async () => {
    const page: ActivityFeedPage = { events: [makeEvent('e1', T1)], nextCursor: null };
    const fetchPage = jest.fn().mockResolvedValue(ok(page));

    const { result } = renderHook(() => usePaginatedActivityFeed(fetchPage));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { result.current.loadMore(); });

    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('surfaces an error from the first page without throwing', async () => {
    const fetchPage = jest.fn().mockResolvedValue(err({ kind: 'NetworkError', message: 'down' }));

    const { result } = renderHook(() => usePaginatedActivityFeed(fetchPage));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toEqual({ kind: 'NetworkError', message: 'down' });
    expect(result.current.events).toEqual([]);
  });

  it('re-fetches from scratch when the fetchPage identity changes (new scope)', async () => {
    const pageA: ActivityFeedPage = { events: [makeEvent('a1', T1)], nextCursor: null };
    const pageB: ActivityFeedPage = { events: [makeEvent('b1', T3)], nextCursor: null };
    const fetchA = jest.fn().mockResolvedValue(ok(pageA));
    const fetchB = jest.fn().mockResolvedValue(ok(pageB));

    const { result, rerender } = renderHook(
      ({ fetchPage }) => usePaginatedActivityFeed(fetchPage),
      { initialProps: { fetchPage: fetchA } },
    );
    await waitFor(() => expect(result.current.events.map(e => e.id)).toEqual(['a1']));

    rerender({ fetchPage: fetchB });
    await waitFor(() => expect(result.current.events.map(e => e.id)).toEqual(['b1']));
  });
});
