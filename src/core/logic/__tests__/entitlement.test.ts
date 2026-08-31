import {
  computeSubscriptionRenewalExpiry,
  computeTripPassExpiry,
  hasFullAccess,
  remainingFreeUses,
  resolveEntitlementSource,
} from '../entitlement';
import type { EntitlementState } from '../entitlement';
import { tripPassFactory, subscriptionWindowFactory } from '../../../__testUtils__/factories';

const NOW = new Date('2025-06-15T12:00:00Z');

function makeState(overrides: Partial<EntitlementState> = {}): EntitlementState {
  return {
    override: false,
    qaUnlock: false,
    subscription: null,
    tripPasses: [],
    ...overrides,
  };
}

// ── precedence order ────────────────────────────────────────────────────────

describe('resolveEntitlementSource — precedence', () => {
  it('returns "override" even when nothing else is active', () => {
    const state = makeState({ override: true });
    expect(resolveEntitlementSource(state, undefined, NOW)).toBe('override');
  });

  it('returns "override" ahead of qaUnlock, subscription, and trip pass', () => {
    const state = makeState({
      override: true,
      qaUnlock: true,
      subscription: subscriptionWindowFactory({ expiresAt: new Date('2025-07-01T00:00:00Z') }),
      tripPasses: [tripPassFactory({ tripId: 't1', expiresAt: new Date('2025-07-01T00:00:00Z') })],
    });
    expect(resolveEntitlementSource(state, 't1', NOW)).toBe('override');
  });

  it('returns "qa_build" ahead of subscription and trip pass', () => {
    const state = makeState({
      qaUnlock: true,
      subscription: subscriptionWindowFactory({ expiresAt: new Date('2025-07-01T00:00:00Z') }),
      tripPasses: [tripPassFactory({ tripId: 't1', expiresAt: new Date('2025-07-01T00:00:00Z') })],
    });
    expect(resolveEntitlementSource(state, 't1', NOW)).toBe('qa_build');
  });

  it('returns "subscription" ahead of trip pass', () => {
    const state = makeState({
      subscription: subscriptionWindowFactory({ expiresAt: new Date('2025-07-01T00:00:00Z') }),
      tripPasses: [tripPassFactory({ tripId: 't1', expiresAt: new Date('2025-07-01T00:00:00Z') })],
    });
    expect(resolveEntitlementSource(state, 't1', NOW)).toBe('subscription');
  });

  it('returns "trip_pass" when only a matching active pass exists', () => {
    const state = makeState({
      tripPasses: [tripPassFactory({ tripId: 't1', expiresAt: new Date('2025-07-01T00:00:00Z') })],
    });
    expect(resolveEntitlementSource(state, 't1', NOW)).toBe('trip_pass');
  });

  it('returns "free" when nothing is active', () => {
    expect(resolveEntitlementSource(makeState(), 't1', NOW)).toBe('free');
  });
});

// ── subscription expiry boundary ─────────────────────────────────────────────

describe('resolveEntitlementSource — subscription boundary', () => {
  it('treats a subscription expiring exactly now as inactive', () => {
    const state = makeState({ subscription: subscriptionWindowFactory({ expiresAt: NOW }) });
    expect(resolveEntitlementSource(state, undefined, NOW)).toBe('free');
  });

  it('treats a subscription expiring one millisecond after now as active', () => {
    const state = makeState({
      subscription: subscriptionWindowFactory({ expiresAt: new Date(NOW.getTime() + 1) }),
    });
    expect(resolveEntitlementSource(state, undefined, NOW)).toBe('subscription');
  });

  it('treats a subscription that expired one millisecond ago as inactive', () => {
    const state = makeState({
      subscription: subscriptionWindowFactory({ expiresAt: new Date(NOW.getTime() - 1) }),
    });
    expect(resolveEntitlementSource(state, undefined, NOW)).toBe('free');
  });
});

// ── trip pass scoping ────────────────────────────────────────────────────────

describe('resolveEntitlementSource — trip pass scoping', () => {
  it('does not leak an active pass into a different trip', () => {
    const state = makeState({
      tripPasses: [tripPassFactory({ tripId: 't1', expiresAt: new Date('2025-07-01T00:00:00Z') })],
    });
    expect(resolveEntitlementSource(state, 't2', NOW)).toBe('free');
  });

  it('ignores an expired pass for the same trip', () => {
    const state = makeState({
      tripPasses: [tripPassFactory({ tripId: 't1', expiresAt: new Date('2025-06-01T00:00:00Z') })],
    });
    expect(resolveEntitlementSource(state, 't1', NOW)).toBe('free');
  });

  it('does not grant access when no tripId is given, even with an active pass', () => {
    const state = makeState({
      tripPasses: [tripPassFactory({ tripId: 't1', expiresAt: new Date('2025-07-01T00:00:00Z') })],
    });
    expect(resolveEntitlementSource(state, undefined, NOW)).toBe('free');
  });

  it('picks the matching pass out of several for other trips', () => {
    const state = makeState({
      tripPasses: [
        tripPassFactory({ tripId: 't1', expiresAt: new Date('2025-06-01T00:00:00Z') }), // expired
        tripPassFactory({ tripId: 't2', expiresAt: new Date('2025-07-01T00:00:00Z') }), // active, other trip
        tripPassFactory({ tripId: 't3', expiresAt: new Date('2025-07-01T00:00:00Z') }), // active, target trip
      ],
    });
    expect(resolveEntitlementSource(state, 't3', NOW)).toBe('trip_pass');
  });
});

// ── hasFullAccess ─────────────────────────────────────────────────────────────

describe('hasFullAccess', () => {
  it('is false for the free tier', () => {
    expect(hasFullAccess(makeState(), 't1', NOW)).toBe(false);
  });

  it('is true for any non-free source', () => {
    expect(hasFullAccess(makeState({ override: true }), undefined, NOW)).toBe(true);
  });
});

// ── remainingFreeUses ─────────────────────────────────────────────────────────

describe('remainingFreeUses', () => {
  it('returns the full cap at zero usage', () => {
    expect(remainingFreeUses(0, 'ocr_scan')).toBe(5);
    expect(remainingFreeUses(0, 'report_export')).toBe(5);
  });

  it('counts down as usage increases', () => {
    expect(remainingFreeUses(4, 'ocr_scan')).toBe(1);
  });

  it('reaches exactly zero at the cap, not before or after', () => {
    expect(remainingFreeUses(4, 'ocr_scan')).toBe(1);
    expect(remainingFreeUses(5, 'ocr_scan')).toBe(0);
    expect(remainingFreeUses(6, 'ocr_scan')).toBe(0);
  });

  it('never goes negative when usage exceeds the cap', () => {
    expect(remainingFreeUses(99, 'report_export')).toBe(0);
  });
});

// ── computeTripPassExpiry ─────────────────────────────────────────────────────

describe('computeTripPassExpiry', () => {
  it('expires exactly 30 days after purchase', () => {
    const purchasedAt = new Date('2025-06-01T00:00:00Z');
    expect(computeTripPassExpiry(purchasedAt)).toEqual(new Date('2025-07-01T00:00:00Z'));
  });
});

// ── computeSubscriptionRenewalExpiry (rolling window) ─────────────────────────

describe('computeSubscriptionRenewalExpiry', () => {
  it('starts a first subscription 30 days from now when there is no prior expiry', () => {
    expect(computeSubscriptionRenewalExpiry(null, NOW)).toEqual(new Date('2025-07-15T12:00:00Z'));
  });

  it('stacks a renewal from the current expiry when it is still in the future, not from now', () => {
    const currentExpiry = new Date('2025-06-20T12:00:00Z'); // 5 days after NOW, still active
    expect(computeSubscriptionRenewalExpiry(currentExpiry, NOW)).toEqual(new Date('2025-07-20T12:00:00Z'));
  });

  it('renews from now, not from the lapsed expiry, when resubscribing after a lapse', () => {
    const currentExpiry = new Date('2025-06-01T12:00:00Z'); // 14 days before NOW, already lapsed
    expect(computeSubscriptionRenewalExpiry(currentExpiry, NOW)).toEqual(new Date('2025-07-15T12:00:00Z'));
  });

  it('renews from now, not from the expiry, at the exact instant of expiry', () => {
    // currentExpiry === now: neither "still active" nor "in the future", so the
    // boundary must resolve to max(now, now) = now, not silently drop a day.
    expect(computeSubscriptionRenewalExpiry(NOW, NOW)).toEqual(new Date('2025-07-15T12:00:00Z'));
  });

  it('renews from the current expiry when it is one millisecond in the future', () => {
    const currentExpiry = new Date(NOW.getTime() + 1);
    expect(computeSubscriptionRenewalExpiry(currentExpiry, NOW).getTime()).toBe(
      currentExpiry.getTime() + 30 * 24 * 60 * 60 * 1000,
    );
  });
});
