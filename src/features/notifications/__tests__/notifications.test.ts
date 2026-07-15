import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { ServiceContext } from '../../../core/di/ServiceContext';
import { createTestContainer } from '../../../core/di/testContainer';
import { AUTH, NOTIFICATION_SERVICE, TRIP_STORE } from '../../../core/di/tokens';
import { MockNotificationService } from '../../../__mocks__/MockNotificationService';
import { useRegisterPushToken } from '../hooks/useRegisterPushToken';
import { useCreateGroupExpense } from '../../groups/hooks/useCreateGroupExpense';
import { groupFactory, groupMemberFactory } from '../../../__testUtils__/factories';
import type { ServiceContainer } from '../../../core/di/ServiceContainer';

function makeWrapper(container: ServiceContainer) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(ServiceContext.Provider, { value: container }, children);
  };
}

const MOCK_TOKEN = 'ExponentPushToken[test-mock-token]';
const GROUP_ID   = 'g1';

// ── useRegisterPushToken ──────────────────────────────────────────────────────

describe('useRegisterPushToken', () => {
  let container: ServiceContainer;
  let notificationService: MockNotificationService;

  beforeEach(async () => {
    container           = createTestContainer();
    notificationService = container.resolve(NOTIFICATION_SERVICE) as MockNotificationService;
    // Sign in so currentUser() returns a valid user
    await container.resolve(AUTH).signIn('alice@test.com', 'password');
    // Reset expo-notifications mocks between tests
    jest.mocked(Notifications.requestPermissionsAsync).mockResolvedValue({ status: 'granted' } as never);
    jest.mocked(Notifications.getExpoPushTokenAsync).mockResolvedValue({ data: MOCK_TOKEN } as never);
  });

  it('registers the device token when permissions are granted', async () => {
    renderHook(() => useRegisterPushToken(), { wrapper: makeWrapper(container) });
    await act(async () => {});

    expect(notificationService.registerCalls).toHaveLength(1);
    expect(notificationService.registerCalls[0].token).toBe(MOCK_TOKEN);
    expect(notificationService.registerCalls[0].userId).toBe('user_alice@test.com');
  });

  it('uses ios platform on iOS', async () => {
    renderHook(() => useRegisterPushToken(), { wrapper: makeWrapper(container) });
    await act(async () => {});

    // jest-expo defaults to ios
    expect(['ios', 'android']).toContain(notificationService.registerCalls[0]?.platform);
  });

  it('does not register when permissions are denied', async () => {
    jest.mocked(Notifications.requestPermissionsAsync).mockResolvedValue({ status: 'denied' } as never);

    renderHook(() => useRegisterPushToken(), { wrapper: makeWrapper(container) });
    await act(async () => {});

    expect(notificationService.registerCalls).toHaveLength(0);
  });

  it('does not register when no user is signed in', async () => {
    await container.resolve(AUTH).signOut();

    renderHook(() => useRegisterPushToken(), { wrapper: makeWrapper(container) });
    await act(async () => {});

    expect(notificationService.registerCalls).toHaveLength(0);
  });
});

// ── useCreateGroupExpense — notification integration ─────────────────────────

describe('useCreateGroupExpense — notifications', () => {
  let container: ServiceContainer;
  let notificationService: MockNotificationService;

  const validInput = {
    description:      'Dinner',
    totalAmountCents: 6000,
    currency:         'EUR',
    paidByUserId:     'u1',
    splits: [
      { userId: 'u1', amountOwedCents: 3000 },
      { userId: 'u2', amountOwedCents: 3000 },
    ],
  };

  beforeEach(() => {
    container           = createTestContainer();
    notificationService = container.resolve(NOTIFICATION_SERVICE) as MockNotificationService;

    const group = groupFactory({
      id:      GROUP_ID,
      name:    'Weekend Crew',
      members: [
        groupMemberFactory({ userId: 'u1', displayName: 'Alice', groupId: GROUP_ID }),
        groupMemberFactory({ userId: 'u2', displayName: 'Bob',   groupId: GROUP_ID }),
      ],
    });
    container.resolve(TRIP_STORE).getState().appendGroup(group);
  });

  it('enqueues a push notification for each non-payer member', async () => {
    const { result } = renderHook(
      () => useCreateGroupExpense(GROUP_ID),
      { wrapper: makeWrapper(container) },
    );

    await act(async () => { await result.current.createGroupExpense(validInput); });

    expect(notificationService.enqueueCalls).toHaveLength(1);
    expect(notificationService.enqueueCalls[0]).toMatchObject({
      userId:    'u2',
      channel:   'push',
      eventType: 'expense_added',
    });
  });

  it('does not enqueue a notification for the payer', async () => {
    const { result } = renderHook(
      () => useCreateGroupExpense(GROUP_ID),
      { wrapper: makeWrapper(container) },
    );

    await act(async () => { await result.current.createGroupExpense(validInput); });

    const callsForPayer = notificationService.enqueueCalls.filter(c => c.userId === 'u1');
    expect(callsForPayer).toHaveLength(0);
  });

  it('enqueues one notification per non-payer in a larger group', async () => {
    const storeApi = container.resolve(TRIP_STORE).getState();
    const bigGroup = groupFactory({
      id:      'g-big',
      name:    'Big Group',
      members: [
        groupMemberFactory({ userId: 'u1', groupId: 'g-big' }),
        groupMemberFactory({ userId: 'u2', groupId: 'g-big' }),
        groupMemberFactory({ userId: 'u3', groupId: 'g-big' }),
        groupMemberFactory({ userId: 'u4', groupId: 'g-big' }),
      ],
    });
    storeApi.appendGroup(bigGroup);

    const { result } = renderHook(
      () => useCreateGroupExpense('g-big'),
      { wrapper: makeWrapper(container) },
    );

    const bigInput = {
      ...validInput,
      splits: [
        { userId: 'u1', amountOwedCents: 1500 },
        { userId: 'u2', amountOwedCents: 1500 },
        { userId: 'u3', amountOwedCents: 1500 },
        { userId: 'u4', amountOwedCents: 1500 },
      ],
      totalAmountCents: 6000,
    };

    await act(async () => { await result.current.createGroupExpense(bigInput); });

    expect(notificationService.enqueueCalls).toHaveLength(3); // everyone except u1
    const notifiedIds = notificationService.enqueueCalls.map(c => c.userId).sort();
    expect(notifiedIds).toEqual(['u2', 'u3', 'u4']);
  });

  it('notification payload includes the group name and expense description', async () => {
    const { result } = renderHook(
      () => useCreateGroupExpense(GROUP_ID),
      { wrapper: makeWrapper(container) },
    );

    await act(async () => { await result.current.createGroupExpense(validInput); });

    const payload = notificationService.enqueueCalls[0].payload;
    expect(payload.title).toBe('Weekend Crew');
    expect(typeof payload.body).toBe('string');
    expect(String(payload.body)).toContain('Dinner');
    expect(String(payload.body)).toContain('Alice');
  });

  it('does not enqueue when expense creation fails validation', async () => {
    const { result } = renderHook(
      () => useCreateGroupExpense(GROUP_ID),
      { wrapper: makeWrapper(container) },
    );

    await act(async () => {
      await result.current.createGroupExpense({ ...validInput, description: '' });
    });

    expect(notificationService.enqueueCalls).toHaveLength(0);
  });

  it('expense is created even if notification service would fail', async () => {
    notificationService.enqueue = async () => { throw new Error('provider down'); };

    const { result } = renderHook(
      () => useCreateGroupExpense(GROUP_ID),
      { wrapper: makeWrapper(container) },
    );

    let expense = null;
    await act(async () => { expense = await result.current.createGroupExpense(validInput); });

    expect(expense).not.toBeNull();
    expect(result.current.error).toBeNull();
  });
});

