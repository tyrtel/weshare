import React from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { renderHook, act } from '@testing-library/react-native';
import { useRealtimeSync } from '../useRealtimeSync';
import { ServiceContext } from '../../core/di/ServiceContext';
import { createTestContainer } from '../../core/di/testContainer';
import { EXPENSE_REPO, REALTIME, TRIP_STORE } from '../../core/di/tokens';
import type { MockRealtimeService } from '../../__mocks__/MockRealtimeService';
import type { ServiceContainer } from '../../core/di/ServiceContainer';
import { expenseFactory } from '../../__testUtils__/factories';

function makeWrapper(container: ServiceContainer) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(ServiceContext.Provider, { value: container }, children);
  };
}

describe('useRealtimeSync', () => {
  let appStateListener: ((s: AppStateStatus) => void) | null;

  beforeEach(() => {
    jest.useFakeTimers();
    appStateListener = null;
    Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
      appStateListener = listener as (s: AppStateStatus) => void;
      return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
    });
  });

  afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

  it('does not subscribe while disabled (signed out or starting up)', () => {
    const container = createTestContainer();
    renderHook(() => useRealtimeSync(false), { wrapper: makeWrapper(container) });
    expect((container.resolve(REALTIME) as MockRealtimeService).subscriberCount).toBe(0);
  });

  it('refetches a cached trip when another member adds an expense to it', async () => {
    const container = createTestContainer();
    const store = container.resolve(TRIP_STORE);
    await store.getState().revalidate('trip:t1');
    renderHook(() => useRealtimeSync(true), { wrapper: makeWrapper(container) });

    await container.resolve(EXPENSE_REPO).saveExpense(expenseFactory({ id: 'e9', tripId: 't1' }));
    act(() => {
      (container.resolve(REALTIME) as MockRealtimeService).emit({
        table: 'expenses', type: 'INSERT', row: { id: 'e9', trip_id: 't1', group_id: null }, old: null,
      });
    });
    await act(async () => { await jest.advanceTimersByTimeAsync(1000); });

    expect(store.getState().expenses['t1'].map(e => e.id)).toEqual(['e9']);
  });

  it('closes the stream in the background and reopens it in the foreground', () => {
    const container = createTestContainer();
    const realtime = container.resolve(REALTIME) as MockRealtimeService;
    const { unmount } = renderHook(() => useRealtimeSync(true), { wrapper: makeWrapper(container) });
    expect(realtime.subscriberCount).toBe(1);

    act(() => { appStateListener?.('background'); });
    expect(realtime.subscriberCount).toBe(0);

    act(() => { appStateListener?.('active'); });
    expect(realtime.subscriberCount).toBe(1);

    unmount();
    expect(realtime.subscriberCount).toBe(0);
  });
});
