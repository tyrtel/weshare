let mockExtra: Record<string, unknown> = {};

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() { return { extra: mockExtra }; },
  },
}));

jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    configure: jest.fn(),
    logIn: jest.fn().mockResolvedValue(undefined),
    logOut: jest.fn().mockResolvedValue(undefined),
    getProducts: jest.fn(),
    purchaseStoreProduct: jest.fn(),
    setAttributes: jest.fn().mockResolvedValue(undefined),
    restorePurchases: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../supabase/supabaseClient', () => ({
  supabase: {
    auth: { onAuthStateChange: jest.fn(), getUser: jest.fn() },
    rpc:  jest.fn(),
    from: jest.fn(),
  },
}));

jest.mock('../../core/utils/logger', () => ({
  logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import Purchases from 'react-native-purchases';
import { RevenueCatEntitlementService } from '../services/RevenueCatEntitlementService';
import { mockChain } from '../../__testUtils__/supabaseMockChain';

const { supabase } = require('../supabase/supabaseClient') as {
  supabase: {
    auth: { onAuthStateChange: jest.Mock; getUser: jest.Mock };
    rpc:  jest.Mock;
    from: jest.Mock;
  };
};

function subRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub1', user_id: 'u1',
    started_at: '2026-01-01T00:00:00.000Z',
    expires_at: '2027-01-01T00:00:00.000Z',
    store_transaction_id: 'tx1',
    ...overrides,
  };
}

function passRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pass1', user_id: 'u1', trip_id: 't1',
    purchased_at: '2026-01-01T00:00:00.000Z',
    expires_at: '2027-01-01T00:00:00.000Z',
    store_transaction_id: 'tx2',
    ...overrides,
  };
}

// Routes each of refresh()'s four parallel supabase.from(table) calls to its
// own canned response, keyed by table name.
function mockFromByTable(byTable: Record<string, { data: unknown; error: unknown }>) {
  supabase.from.mockImplementation((table: string) => mockChain(
    (byTable[table] as { data: unknown; error: null | { message: string } }) ?? { data: null, error: null },
  ));
}

// A handful of tables (trip_passes, subscription_windows) are queried two
// different ways: as a single row via .maybeSingle() (fetchActiveTripPass /
// fetchActiveSubscription, used while polling after a purchase) and as a
// plain array (refresh()'s own bulk queries). plain mockChain() can't serve
// both shapes for the same table in one test, so this picks the shape based
// on which terminal method the caller actually invokes.
function mockChainDual(singleRowData: unknown, arrayData: unknown) {
  const proxy: object = new Proxy(
    {},
    {
      get(_target, prop: string) {
        if (prop === 'maybeSingle' || prop === 'single') {
          return () => Promise.resolve({ data: singleRowData, error: null });
        }
        if (prop === 'then') return (res: unknown, rej: unknown) => Promise.resolve({ data: arrayData, error: null }).then(res as never, rej as never);
        if (prop === 'catch' || prop === 'finally') return () => proxy;
        return () => proxy;
      },
    },
  );
  return proxy;
}

// Skip the real 1s delays inside pollUntilPresent.
function makeSetTimeoutSynchronous() {
  jest.spyOn(global, 'setTimeout').mockImplementation(((cb: () => void) => { cb(); return 0 as unknown as NodeJS.Timeout; }) as typeof setTimeout);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  mockExtra = { revenueCatIosApiKey: 'ios-key', revenueCatAndroidApiKey: 'android-key' };
  supabase.auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } });
});

describe('RevenueCatEntitlementService — construction', () => {
  it('configures Purchases with the iOS key on iOS (default test platform)', () => {
    new RevenueCatEntitlementService();
    expect(Purchases.configure).toHaveBeenCalledWith({ apiKey: 'ios-key' });
  });

  it('warns and skips configure when no API key is set for the platform', () => {
    mockExtra = {};
    const { logger } = require('../../core/utils/logger');
    new RevenueCatEntitlementService();
    expect(Purchases.configure).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('registers an auth-state listener that logs the RevenueCat user in on sign-in', () => {
    new RevenueCatEntitlementService();
    const handler = supabase.auth.onAuthStateChange.mock.calls[0][0];
    handler('SIGNED_IN', { user: { id: 'u1' } });
    expect(Purchases.logIn).toHaveBeenCalledWith('u1');
  });

  it('logs the RevenueCat user out when the session ends', () => {
    new RevenueCatEntitlementService();
    const handler = supabase.auth.onAuthStateChange.mock.calls[0][0];
    handler('SIGNED_OUT', null);
    expect(Purchases.logOut).toHaveBeenCalled();
  });

  it('qaUnlock skips Purchases.configure and the auth listener entirely', () => {
    mockExtra = { qaUnlock: true };
    new RevenueCatEntitlementService();
    expect(Purchases.configure).not.toHaveBeenCalled();
    expect(supabase.auth.onAuthStateChange).not.toHaveBeenCalled();
  });
});

describe('RevenueCatEntitlementService — getStatus / hasFullAccess / remainingFreeUses', () => {
  it('reports the free source and full usage caps before any refresh', () => {
    const service = new RevenueCatEntitlementService();
    const status = service.getStatus();
    expect(status.source).toBe('free');
    expect(status.subscriptionExpiresAt).toBeNull();
    expect(status.usage).toEqual({ ocr_scan: 0, report_export: 0 });
    expect(service.hasFullAccess()).toBe(false);
    expect(service.remainingFreeUses('ocr_scan')).toBe(5);
  });

  it('reports qa_build source and full access when qaUnlock is set', () => {
    mockExtra = { qaUnlock: true };
    const service = new RevenueCatEntitlementService();
    expect(service.getStatus().source).toBe('qa_build');
    expect(service.hasFullAccess()).toBe(true);
  });

  it('reflects an active subscription after refresh', async () => {
    const service = new RevenueCatEntitlementService();
    supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockFromByTable({
      users: { data: { full_access_override: false }, error: null },
      subscription_windows: { data: [subRow()], error: null },
      trip_passes: { data: [], error: null },
      user_feature_usage: { data: [], error: null },
    });

    await service.refresh();

    expect(service.hasFullAccess()).toBe(true);
    expect(service.getStatus().source).toBe('subscription');
    expect(service.getStatus().subscriptionExpiresAt).toEqual(new Date('2027-01-01T00:00:00.000Z'));
  });
});

describe('RevenueCatEntitlementService — consumeUsage', () => {
  it('bypasses the RPC entirely for a QA-unlocked build', async () => {
    mockExtra = { qaUnlock: true };
    const service = new RevenueCatEntitlementService();

    const result = await service.consumeUsage('ocr_scan');

    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, value: { allowed: true, remaining: null } });
  });

  it('calls increment_usage_if_allowed with the feature and trip id', async () => {
    const service = new RevenueCatEntitlementService();
    supabase.rpc.mockResolvedValue({ data: [{ allowed: true, remaining: 4 }], error: null });

    await service.consumeUsage('ocr_scan', 't1');

    expect(supabase.rpc).toHaveBeenCalledWith('increment_usage_if_allowed', { p_feature: 'ocr_scan', p_trip_id: 't1' });
  });

  it('increments local usage on an allowed, finite-remaining result', async () => {
    const service = new RevenueCatEntitlementService();
    supabase.rpc.mockResolvedValue({ data: [{ allowed: true, remaining: 4 }], error: null });

    await service.consumeUsage('ocr_scan');

    expect(service.getStatus().usage.ocr_scan).toBe(1);
  });

  it('does not increment local usage when remaining is null (unlimited)', async () => {
    const service = new RevenueCatEntitlementService();
    supabase.rpc.mockResolvedValue({ data: [{ allowed: true, remaining: null }], error: null });

    await service.consumeUsage('ocr_scan');

    expect(service.getStatus().usage.ocr_scan).toBe(0);
  });

  it('does not increment local usage when the request was disallowed', async () => {
    const service = new RevenueCatEntitlementService();
    supabase.rpc.mockResolvedValue({ data: [{ allowed: false, remaining: 0 }], error: null });

    const result = await service.consumeUsage('ocr_scan');

    expect(result).toEqual({ ok: true, value: { allowed: false, remaining: 0 } });
    expect(service.getStatus().usage.ocr_scan).toBe(0);
  });

  it('defaults to disallowed when the RPC returns no rows', async () => {
    const service = new RevenueCatEntitlementService();
    supabase.rpc.mockResolvedValue({ data: [], error: null });

    const result = await service.consumeUsage('ocr_scan');

    expect(result).toEqual({ ok: true, value: { allowed: false, remaining: null } });
  });

  it('returns a NetworkError when the RPC fails', async () => {
    const service = new RevenueCatEntitlementService();
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'db down' } });

    const result = await service.consumeUsage('ocr_scan');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('NetworkError');
    }
  });
});

describe('RevenueCatEntitlementService — canCreate', () => {
  it('bypasses the RPC entirely for a QA-unlocked build', async () => {
    mockExtra = { qaUnlock: true };
    const service = new RevenueCatEntitlementService();

    const result = await service.canCreate('group');

    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, value: true });
  });

  it("calls can_create_group with no args for the 'group' feature", async () => {
    const service = new RevenueCatEntitlementService();
    supabase.rpc.mockResolvedValue({ data: [{ allowed: true }], error: null });

    await service.canCreate('group');

    expect(supabase.rpc).toHaveBeenCalledWith('can_create_group');
  });

  it("calls can_create_recurring_expense with the group id for the 'recurring_expense' feature", async () => {
    const service = new RevenueCatEntitlementService();
    supabase.rpc.mockResolvedValue({ data: [{ allowed: false }], error: null });

    await service.canCreate('recurring_expense', 'g1');

    expect(supabase.rpc).toHaveBeenCalledWith('can_create_recurring_expense', { p_group_id: 'g1' });
  });

  it('defaults to false when the RPC returns no rows', async () => {
    const service = new RevenueCatEntitlementService();
    supabase.rpc.mockResolvedValue({ data: [], error: null });

    const result = await service.canCreate('group');

    expect(result).toEqual({ ok: true, value: false });
  });

  it('returns a NetworkError when the RPC fails', async () => {
    const service = new RevenueCatEntitlementService();
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'db down' } });

    const result = await service.canCreate('group');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NetworkError');
  });
});

describe('RevenueCatEntitlementService — purchaseTripPass', () => {
  beforeEach(() => {
    supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
  });

  it('buys the product, tags the pending trip id, and returns the confirmed pass', async () => {
    const service = new RevenueCatEntitlementService();
    (Purchases.getProducts as jest.Mock).mockResolvedValue([{ identifier: 'trip_pass_single' }]);
    (Purchases.purchaseStoreProduct as jest.Mock).mockResolvedValue(undefined);
    supabase.from.mockImplementation((table: string) => {
      if (table === 'trip_passes') return mockChainDual(passRow(), [passRow()]);
      if (table === 'users') return mockChain({ data: { full_access_override: false }, error: null });
      return mockChain({ data: [], error: null });
    });

    const result = await service.purchaseTripPass('t1');

    expect(Purchases.setAttributes).toHaveBeenCalledWith({ pending_trip_pass_trip_id: 't1' });
    expect(Purchases.purchaseStoreProduct).toHaveBeenCalledWith({ identifier: 'trip_pass_single' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.tripId).toBe('t1');
  });

  it('returns an error when the Trip Pass product is unavailable', async () => {
    const service = new RevenueCatEntitlementService();
    (Purchases.getProducts as jest.Mock).mockResolvedValue([]);

    const result = await service.purchaseTripPass('t1');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NetworkError');
    expect(Purchases.purchaseStoreProduct).not.toHaveBeenCalled();
  });

  it('maps a user-cancelled purchase to a ValidationError', async () => {
    const service = new RevenueCatEntitlementService();
    (Purchases.getProducts as jest.Mock).mockResolvedValue([{ identifier: 'trip_pass_single' }]);
    (Purchases.purchaseStoreProduct as jest.Mock).mockRejectedValue({ userCancelled: true });

    const result = await service.purchaseTripPass('t1');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('ValidationError');
  });

  it('maps any other purchase failure to a NetworkError', async () => {
    const service = new RevenueCatEntitlementService();
    (Purchases.getProducts as jest.Mock).mockResolvedValue([{ identifier: 'trip_pass_single' }]);
    (Purchases.purchaseStoreProduct as jest.Mock).mockRejectedValue(new Error('store unreachable'));

    const result = await service.purchaseTripPass('t1');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('NetworkError');
    }
  });

  it('reports an unconfirmed purchase when the webhook row never lands', async () => {
    makeSetTimeoutSynchronous();
    const service = new RevenueCatEntitlementService();
    (Purchases.getProducts as jest.Mock).mockResolvedValue([{ identifier: 'trip_pass_single' }]);
    (Purchases.purchaseStoreProduct as jest.Mock).mockResolvedValue(undefined);
    // Every poll attempt (and the fetchActiveTripPass lookup) finds nothing.
    supabase.from.mockReturnValue(mockChain({ data: null, error: null }));

    const result = await service.purchaseTripPass('t1');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NetworkError');
  }, 15000);
});

describe('RevenueCatEntitlementService — purchaseSubscription', () => {
  beforeEach(() => {
    supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
  });

  it('buys the product and returns the confirmed subscription window', async () => {
    const service = new RevenueCatEntitlementService();
    (Purchases.getProducts as jest.Mock).mockResolvedValue([{ identifier: 'premium_monthly' }]);
    (Purchases.purchaseStoreProduct as jest.Mock).mockResolvedValue(undefined);
    supabase.from.mockImplementation((table: string) => {
      if (table === 'subscription_windows') return mockChainDual(subRow(), [subRow()]);
      if (table === 'users') return mockChain({ data: { full_access_override: false }, error: null });
      return mockChain({ data: [], error: null });
    });

    const result = await service.purchaseSubscription();

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.id).toBe('sub1');
  });

  it('returns an error when the Premium Monthly product is unavailable', async () => {
    const service = new RevenueCatEntitlementService();
    (Purchases.getProducts as jest.Mock).mockResolvedValue([]);

    const result = await service.purchaseSubscription();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NetworkError');
  });

  it('maps a user-cancelled purchase to a ValidationError', async () => {
    const service = new RevenueCatEntitlementService();
    (Purchases.getProducts as jest.Mock).mockResolvedValue([{ identifier: 'premium_monthly' }]);
    (Purchases.purchaseStoreProduct as jest.Mock).mockRejectedValue({ userCancelled: true });

    const result = await service.purchaseSubscription();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('ValidationError');
  });

  it('maps any other purchase failure to a NetworkError', async () => {
    const service = new RevenueCatEntitlementService();
    (Purchases.getProducts as jest.Mock).mockResolvedValue([{ identifier: 'premium_monthly' }]);
    (Purchases.purchaseStoreProduct as jest.Mock).mockRejectedValue(new Error('store unreachable'));

    const result = await service.purchaseSubscription();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NetworkError');
  });

  it('reports an unconfirmed purchase when the webhook row never lands', async () => {
    makeSetTimeoutSynchronous();
    const service = new RevenueCatEntitlementService();
    (Purchases.getProducts as jest.Mock).mockResolvedValue([{ identifier: 'premium_monthly' }]);
    (Purchases.purchaseStoreProduct as jest.Mock).mockResolvedValue(undefined);
    supabase.from.mockReturnValue(mockChain({ data: null, error: null }));

    const result = await service.purchaseSubscription();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NetworkError');
  }, 15000);
});

describe('RevenueCatEntitlementService — restorePurchases', () => {
  it('restores and refreshes local state', async () => {
    const service = new RevenueCatEntitlementService();
    supabase.auth.getUser.mockResolvedValue({ data: { user: null } });

    const result = await service.restorePurchases();

    expect(Purchases.restorePurchases).toHaveBeenCalled();
    expect(result).toEqual({ ok: true, value: undefined });
  });

  it('returns a NetworkError when the store restore call fails', async () => {
    const service = new RevenueCatEntitlementService();
    (Purchases.restorePurchases as jest.Mock).mockRejectedValue(new Error('offline'));

    const result = await service.restorePurchases();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NetworkError');
  });
});

describe('RevenueCatEntitlementService — refresh', () => {
  it('does nothing for a QA-unlocked build', async () => {
    mockExtra = { qaUnlock: true };
    const service = new RevenueCatEntitlementService();

    await service.refresh();

    expect(supabase.auth.getUser).not.toHaveBeenCalled();
  });

  it('resets to signed-out defaults when there is no user', async () => {
    const service = new RevenueCatEntitlementService();
    supabase.rpc.mockResolvedValue({ data: [{ allowed: true, remaining: 4 }], error: null });
    await service.consumeUsage('ocr_scan'); // usage.ocr_scan = 1
    supabase.auth.getUser.mockResolvedValue({ data: { user: null } });

    await service.refresh();

    expect(service.getStatus().usage).toEqual({ ocr_scan: 0, report_export: 0 });
    expect(service.hasFullAccess()).toBe(false);
  });

  it('maps the full_access_override, subscription, trip passes, and usage rows', async () => {
    const service = new RevenueCatEntitlementService();
    supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockFromByTable({
      users: { data: { full_access_override: true }, error: null },
      subscription_windows: { data: [subRow()], error: null },
      trip_passes: { data: [passRow(), passRow({ id: 'pass2', trip_id: 't2' })], error: null },
      user_feature_usage: {
        data: [
          { user_id: 'u1', feature: 'ocr_scan', used_count: 3 },
          { user_id: 'u1', feature: 'report_export', used_count: 1 },
          { user_id: 'u1', feature: 'some_future_feature', used_count: 99 },
        ],
        error: null,
      },
    });

    await service.refresh();

    const status = service.getStatus();
    expect(status.source).toBe('override');
    expect(status.usage).toEqual({ ocr_scan: 3, report_export: 1 });
    expect(service.hasFullAccess('t2')).toBe(true);
  });

  it('treats a missing subscription row as no active subscription', async () => {
    const service = new RevenueCatEntitlementService();
    supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockFromByTable({
      users: { data: { full_access_override: false }, error: null },
      subscription_windows: { data: [], error: null },
      trip_passes: { data: [], error: null },
      user_feature_usage: { data: [], error: null },
    });

    await service.refresh();

    expect(service.getStatus().subscriptionExpiresAt).toBeNull();
  });
});
