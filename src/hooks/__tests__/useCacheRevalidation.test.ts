// Replace useFocusEffect with useEffect so the hook fires without navigation context.
jest.mock('expo-router', () => ({
  useFocusEffect: (cb: Parameters<typeof import('react').useEffect>[0]) => {
    const { useEffect } = require('react');
    useEffect(cb, [cb]);
  },
}));

import React from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { useCacheRevalidation } from '../useCacheRevalidation';
import { ServiceContext } from '../../core/di/ServiceContext';
import { createTestContainer } from '../../core/di/testContainer';
import { EXPENSE_REPO, TRIP_STORE } from '../../core/di/tokens';
import { FRESH_MS } from '../../core/logic/cacheFreshness';
import type { ServiceContainer } from '../../core/di/ServiceContainer';
import type { InMemoryExpenseRepository } from '../../__mocks__/InMemoryExpenseRepository';
import { err } from '../../core/types/Result';

function makeWrapper(container: ServiceContainer) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(ServiceContext.Provider, { value: container }, children);
  };
}

const BUCKETS = ['trip:t1'] as const;

describe('useCacheRevalidation', () => {
  let appStateListener: ((s: AppStateStatus) => void) | null;

  beforeEach(() => {
    appStateListener = null;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
      appStateListener = listener as (s: AppStateStatus) => void;
      return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
    });
  });

  afterEach(() => { jest.restoreAllMocks(); });

  it('is loading until a never-fetched bucket arrives', async () => {
    const container = createTestContainer();
    const { result } = renderHook(() => useCacheRevalidation(BUCKETS), { wrapper: makeWrapper(container) });
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(container.resolve(TRIP_STORE).getState().fetchedAt['trip:t1']).toEqual(expect.any(Number));
  });

  it('is not loading when the bucket is already cached, and skips the request while fresh', async () => {
    const container = createTestContainer();
    await container.resolve(TRIP_STORE).getState().revalidate('trip:t1');
    const spy = jest.spyOn(container.resolve(EXPENSE_REPO), 'getExpensesForTrip');

    const { result } = renderHook(() => useCacheRevalidation(BUCKETS), { wrapper: makeWrapper(container) });
    expect(result.current.loading).toBe(false);
    await act(async () => {});
    expect(spy).not.toHaveBeenCalled();
  });

  it('stops loading after a failed first fetch instead of spinning forever', async () => {
    const container = createTestContainer();
    (container.resolve(EXPENSE_REPO) as InMemoryExpenseRepository).getExpensesForTrip =
      async () => err({ kind: 'NetworkError', message: 'down' });

    const { result } = renderHook(() => useCacheRevalidation(BUCKETS), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(container.resolve(TRIP_STORE).getState().fetchedAt['trip:t1']).toBeUndefined();
  });

  it('revalidates a stale bucket when the app returns to the foreground', async () => {
    const container = createTestContainer();
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    renderHook(() => useCacheRevalidation(BUCKETS), { wrapper: makeWrapper(container) });
    await act(async () => {});
    const spy = jest.spyOn(container.resolve(EXPENSE_REPO), 'getExpensesForTrip');

    await act(async () => { appStateListener?.('active'); });
    expect(spy).not.toHaveBeenCalled();

    now.mockReturnValue(1_000_000 + FRESH_MS);
    await act(async () => { appStateListener?.('active'); });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('refresh always goes to the server', async () => {
    const container = createTestContainer();
    const { result } = renderHook(() => useCacheRevalidation(BUCKETS), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    const spy = jest.spyOn(container.resolve(EXPENSE_REPO), 'getExpensesForTrip');

    await act(async () => { await result.current.refresh(); });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
