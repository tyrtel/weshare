import { MockNotificationService } from '../MockNotificationService';

describe('MockNotificationService', () => {
  let svc: MockNotificationService;

  beforeEach(() => {
    svc = new MockNotificationService();
  });

  // ── enqueue ─────────────────────────────────────────────────────────────────

  it('records an enqueue call', async () => {
    await svc.enqueue({
      userId:    'u1',
      channel:   'push',
      eventType: 'expense_added',
      payload:   { title: 'Test', body: 'Hello' },
    });

    expect(svc.enqueueCalls).toHaveLength(1);
    expect(svc.enqueueCalls[0]).toMatchObject({
      userId:    'u1',
      channel:   'push',
      eventType: 'expense_added',
    });
  });

  it('records multiple enqueue calls independently', async () => {
    await svc.enqueue({ userId: 'u1', channel: 'push', eventType: 'expense_added', payload: {} });
    await svc.enqueue({ userId: 'u2', channel: 'email', eventType: 'debt_owed', payload: {} });

    expect(svc.enqueueCalls).toHaveLength(2);
    expect(svc.enqueueCalls[0].userId).toBe('u1');
    expect(svc.enqueueCalls[1].userId).toBe('u2');
  });

  it('stores a deep copy of the payload so mutation does not affect the record', async () => {
    const payload: Record<string, unknown> = { title: 'Original' };
    await svc.enqueue({ userId: 'u1', channel: 'push', eventType: 'expense_added', payload });
    payload.title = 'Mutated';

    expect(svc.enqueueCalls[0].payload.title).toBe('Original');
  });

  it('stores optional maxAttempts when provided', async () => {
    await svc.enqueue({
      userId:      'u1',
      channel:     'push',
      eventType:   'payment_request',
      payload:     {},
      maxAttempts: 10,
    });

    expect(svc.enqueueCalls[0].maxAttempts).toBe(10);
  });

  // ── registerDeviceToken ──────────────────────────────────────────────────────

  it('records a device token registration', async () => {
    await svc.registerDeviceToken('u1', 'ExponentPushToken[abc]', 'ios');

    expect(svc.registerCalls).toHaveLength(1);
    expect(svc.registerCalls[0]).toEqual({
      userId:   'u1',
      token:    'ExponentPushToken[abc]',
      platform: 'ios',
    });
  });

  it('records android registrations correctly', async () => {
    await svc.registerDeviceToken('u2', 'ExponentPushToken[xyz]', 'android');
    expect(svc.registerCalls[0].platform).toBe('android');
  });

  // ── unregisterDeviceToken ────────────────────────────────────────────────────

  it('records an unregister call', async () => {
    await svc.unregisterDeviceToken('ExponentPushToken[abc]');
    expect(svc.unregisterCalls).toEqual(['ExponentPushToken[abc]']);
  });

  it('starts with empty call arrays on each new instance', () => {
    const fresh = new MockNotificationService();
    expect(fresh.enqueueCalls).toHaveLength(0);
    expect(fresh.registerCalls).toHaveLength(0);
    expect(fresh.unregisterCalls).toHaveLength(0);
  });
});
