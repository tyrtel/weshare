import type { EntitlementSource, SubscriptionWindow, TripPass, UsageFeature } from '../models/Entitlement';

export const FREE_USE_CAP: Record<UsageFeature, number> = {
  ocr_scan: 5,
  report_export: 5,
};

const DAY_MS = 24 * 60 * 60 * 1000;
export const TRIP_PASS_DURATION_DAYS = 30;
export const SUBSCRIPTION_RENEWAL_DAYS = 30;

export interface EntitlementState {
  override: boolean;
  qaUnlock: boolean;
  subscription: SubscriptionWindow | null;
  tripPasses: TripPass[];
}

// Precedence: override -> QA build flag -> active subscription -> active trip
// pass (scoped to tripId) -> free tier. Mirrors TODO_monetization.md.
export function resolveEntitlementSource(
  state: EntitlementState,
  tripId: string | undefined,
  now: Date,
): EntitlementSource {
  if (state.override) return 'override';
  if (state.qaUnlock) return 'qa_build';
  if (state.subscription && state.subscription.expiresAt > now) return 'subscription';
  if (tripId && state.tripPasses.some(p => p.tripId === tripId && p.expiresAt > now)) return 'trip_pass';
  return 'free';
}

export function hasFullAccess(state: EntitlementState, tripId: string | undefined, now: Date): boolean {
  return resolveEntitlementSource(state, tripId, now) !== 'free';
}

export function remainingFreeUses(usedCount: number, feature: UsageFeature): number {
  return Math.max(0, FREE_USE_CAP[feature] - usedCount);
}

export function computeTripPassExpiry(purchasedAt: Date): Date {
  return new Date(purchasedAt.getTime() + TRIP_PASS_DURATION_DAYS * DAY_MS);
}

// Renewals stack from the current expiry when it's still in the future, and
// from `now` when it has already lapsed — so paying again never loses unused
// days, and resubscribing after a lapse never backdates the new window.
export function computeSubscriptionRenewalExpiry(currentExpiry: Date | null, now: Date): Date {
  const baseMs = Math.max(now.getTime(), currentExpiry?.getTime() ?? -Infinity);
  return new Date(baseMs + SUBSCRIPTION_RENEWAL_DAYS * DAY_MS);
}
