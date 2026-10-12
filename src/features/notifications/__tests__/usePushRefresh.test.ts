import React from 'react';
import * as Notifications from 'expo-notifications';
import { renderHook, act } from '@testing-library/react-native';
import { usePushRefresh } from '../hooks/usePushRefresh';
import { ServiceContext } from '../../../core/di/ServiceContext';
import { createTestContainer } from '../../../core/di/testContainer';
import { EXPENSE_REPO, TRIP_STORE } from '../../../core/di/tokens';
import { expenseFactory } from '../../../__testUtils__/factories';
import type { ServiceContainer } from '../../../core/di/ServiceContainer';

function makeWrapper(container: ServiceContainer) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(ServiceContext.Provider, { value: container }, children);
  };
}

const received = Notifications.addNotificationReceivedListener as jest.Mock;
const opened   = Notifications.addNotificationResponseReceivedListener as jest.Mock;

function notification(data: Record<string, unknown>) {
  return { request: { content: { data } } };
}

describe('usePushRefresh', () => {
  beforeEach(() => { jest.useFakeTimers(); received.mockClear(); opened.mockClear(); });
  afterEach(() => { jest.useRealTimers(); });

  it('does not listen while disabled', () => {
    renderHook(() => usePushRefresh(false), { wrapper: makeWrapper(createTestContainer()) });
    expect(received).not.toHaveBeenCalled();
    expect(opened).not.toHaveBeenCalled();
  });

  it('refreshes the group a foreground notification is about', async () => {
    const container = createTestContainer();
    const store = container.resolve(TRIP_STORE);
    await store.getState().revalidate('group:g1');
    renderHook(() => usePushRefresh(true), { wrapper: makeWrapper(container) });

    await container.resolve(EXPENSE_REPO).saveExpense(expenseFactory({ id: 'e5', tripId: undefined, groupId: 'g1' }));
    const onReceived = received.mock.calls[0][0] as (n: unknown) => void;
    act(() => { onReceived(notification({ eventType: 'expense_added', groupId: 'g1' })); });
    await act(async () => { await jest.advanceTimersByTimeAsync(1000); });

    expect(store.getState().groupExpenses['g1'].map(e => e.id)).toEqual(['e5']);
  });

  it('refreshes the group when the user taps the notification', async () => {
    const container = createTestContainer();
    const store = container.resolve(TRIP_STORE);
    await store.getState().revalidate('group:g1');
    renderHook(() => usePushRefresh(true), { wrapper: makeWrapper(container) });
    const spy = jest.spyOn(container.resolve(EXPENSE_REPO), 'getExpensesForGroup');

    const onOpened = opened.mock.calls[0][0] as (r: unknown) => void;
    act(() => { onOpened({ notification: notification({ groupId: 'g1' }) }); });
    await act(async () => { await jest.advanceTimersByTimeAsync(1000); });

    expect(spy).toHaveBeenCalledWith('g1');
  });

  it('removes both listeners on unmount', () => {
    const { unmount } = renderHook(() => usePushRefresh(true), { wrapper: makeWrapper(createTestContainer()) });
    const receivedSub = received.mock.results[0].value as { remove: jest.Mock };
    const openedSub   = opened.mock.results[0].value as { remove: jest.Mock };
    unmount();
    expect(receivedSub.remove).toHaveBeenCalled();
    expect(openedSub.remove).toHaveBeenCalled();
  });
});
