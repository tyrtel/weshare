import { ok, err } from '../core/types/Result';
import type { Result } from '../core/types/Result';
import type { AppError } from '../core/types/AppError';
import type { IEntitlementService, UsageConsumeResult, CountCapFeature } from '../core/interfaces/IEntitlementService';
import type { EntitlementStatus, SubscriptionWindow, TripPass, UsageFeature } from '../core/models/Entitlement';
import {
  computeSubscriptionRenewalExpiry,
  computeTripPassExpiry,
  hasFullAccess as computeHasFullAccess,
  remainingFreeUses as computeRemainingFreeUses,
  resolveEntitlementSource,
} from '../core/logic/entitlement';
import type { EntitlementState } from '../core/logic/entitlement';

// Fully controllable in-memory entitlement service for tests and simulation
// mode. Beyond the interface, exposes setters so screen tests and the
// simulation debug panel can put the entitlement system in any state
// (override, QA unlock, an active/expired trip pass, an active/lapsed
// subscription, a usage count) without touching RevenueCat or Supabase.
export class MockEntitlementService implements IEntitlementService {
  private _override = false;
  private _qaUnlock = false;
  private _subscription: SubscriptionWindow | null = null;
  private _tripPasses: TripPass[] = [];
  private _usage: Record<UsageFeature, number> = { ocr_scan: 0, report_export: 0 };
  // Count-cap state (Chunk G) — activeGroupCount is global (per this mock
  // "user"); activeRecurringExpenseCountByGroup is keyed by groupId since
  // that cap is per-group, not per-user.
  private _activeGroupCount = 0;
  private _activeRecurringExpenseCountByGroup: Record<string, number> = {};
  shouldFail = false;
  shouldCancel = false;

  private state(): EntitlementState {
    return { override: this._override, qaUnlock: this._qaUnlock, subscription: this._subscription, tripPasses: this._tripPasses };
  }

  getStatus(): EntitlementStatus {
    return {
      source: resolveEntitlementSource(this.state(), undefined, new Date()),
      subscriptionExpiresAt: this._subscription?.expiresAt ?? null,
      usage: { ...this._usage },
    };
  }

  hasFullAccess(tripId?: string): boolean {
    return computeHasFullAccess(this.state(), tripId, new Date());
  }

  remainingFreeUses(feature: UsageFeature): number {
    return computeRemainingFreeUses(this._usage[feature], feature);
  }

  async consumeUsage(feature: UsageFeature, tripId?: string): Promise<Result<UsageConsumeResult, AppError>> {
    if (this.hasFullAccess(tripId)) return ok({ allowed: true, remaining: null });

    const remaining = this.remainingFreeUses(feature);
    if (remaining <= 0) return ok({ allowed: false, remaining: 0 });

    this._usage[feature] += 1;
    return ok({ allowed: true, remaining: remaining - 1 });
  }

  async canCreate(feature: CountCapFeature, groupId?: string): Promise<Result<boolean, AppError>> {
    // No tripId — groups/recurring expenses aren't trip-scoped, so this
    // reduces to override -> qaUnlock -> subscription precedence, matching
    // can_create_group/can_create_recurring_expense's own server-side order.
    if (this.hasFullAccess()) return ok(true);

    if (feature === 'group') return ok(this._activeGroupCount < 1);
    return ok((this._activeRecurringExpenseCountByGroup[groupId ?? ''] ?? 0) < 1);
  }

  async purchaseTripPass(tripId: string): Promise<Result<TripPass, AppError>> {
    if (this.shouldCancel) return err({ kind: 'ValidationError', field: 'purchase', message: 'Purchase cancelled' });
    if (this.shouldFail) return err({ kind: 'NetworkError', message: 'Mock failure' });

    const purchasedAt = new Date();
    const pass: TripPass = {
      id: `mock-trip-pass-${this._tripPasses.length + 1}`,
      userId: 'mock-user',
      tripId,
      purchasedAt,
      expiresAt: computeTripPassExpiry(purchasedAt),
      storeTransactionId: `mock-txn-${this._tripPasses.length + 1}`,
    };
    this._tripPasses.push(pass);
    return ok(pass);
  }

  async purchaseSubscription(): Promise<Result<SubscriptionWindow, AppError>> {
    if (this.shouldCancel) return err({ kind: 'ValidationError', field: 'purchase', message: 'Purchase cancelled' });
    if (this.shouldFail) return err({ kind: 'NetworkError', message: 'Mock failure' });

    const now = new Date();
    const window: SubscriptionWindow = {
      id: `mock-subscription-${this._subscription ? 2 : 1}`,
      userId: 'mock-user',
      startedAt: now,
      expiresAt: computeSubscriptionRenewalExpiry(this._subscription?.expiresAt ?? null, now),
      storeTransactionId: `mock-txn-sub-${this._subscription ? 2 : 1}`,
    };
    this._subscription = window;
    return ok(window);
  }

  async restorePurchases(): Promise<Result<void, AppError>> {
    if (this.shouldFail) return err({ kind: 'NetworkError', message: 'Mock failure' });
    return ok(undefined);
  }

  async refresh(): Promise<void> {
    // No remote state to re-sync from in-memory mode.
  }

  // ── Test-only setters ─────────────────────────────────────────────────────

  setOverride(value: boolean): void {
    this._override = value;
  }

  setQaUnlock(value: boolean): void {
    this._qaUnlock = value;
  }

  grantTripPass(tripId: string, expiresAt: Date): void {
    this._tripPasses.push({
      id: `mock-trip-pass-${this._tripPasses.length + 1}`,
      userId: 'mock-user',
      tripId,
      purchasedAt: new Date(),
      expiresAt,
      storeTransactionId: `mock-txn-${this._tripPasses.length + 1}`,
    });
  }

  grantSubscription(expiresAt: Date): void {
    this._subscription = {
      id: 'mock-subscription-override',
      userId: 'mock-user',
      startedAt: new Date(),
      expiresAt,
      storeTransactionId: 'mock-txn-sub-override',
    };
  }

  setUsageCount(feature: UsageFeature, n: number): void {
    this._usage[feature] = n;
  }

  setActiveGroupCount(n: number): void {
    this._activeGroupCount = n;
  }

  setActiveRecurringExpenseCount(groupId: string, n: number): void {
    this._activeRecurringExpenseCountByGroup[groupId] = n;
  }
}
