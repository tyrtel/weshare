import type { Result } from '../types/Result';
import type { AppError } from '../types/AppError';
import type { EntitlementStatus, SubscriptionWindow, TripPass, UsageFeature } from '../models/Entitlement';

export interface UsageConsumeResult {
  allowed: boolean;
  remaining: number | null;   // null when unlimited (override/QA/subscription/trip pass)
}

// Count-cap features (TODO_monetization.md Chunk G) — distinct from
// UsageFeature's cumulative-lifetime model: the cap here is "count of
// currently active rows," so closing/pausing one frees the slot back up.
// 'group' caps per-user (owner); 'recurring_expense' caps per-group.
export type CountCapFeature = 'group' | 'recurring_expense';

export interface IEntitlementService {
  getStatus(): EntitlementStatus;
  hasFullAccess(tripId?: string): boolean;
  remainingFreeUses(feature: UsageFeature): number;

  // Server-side check-and-increment for a gated feature (wraps
  // increment_usage_if_allowed). Call this at the point of use — e.g.
  // immediately before generating a PDF or before an OCR parse — never trust
  // a client-only check, since the server round trip is the actual gate.
  consumeUsage(feature: UsageFeature, tripId?: string): Promise<Result<UsageConsumeResult, AppError>>;

  // Server-side check for a count-cap feature (wraps can_create_group /
  // can_create_recurring_expense). groupId is required only for
  // 'recurring_expense'. Call this immediately before creating a group or
  // recurring expense — same "never trust a client-only check" reasoning
  // as consumeUsage.
  canCreate(feature: CountCapFeature, groupId?: string): Promise<Result<boolean, AppError>>;

  purchaseTripPass(tripId: string): Promise<Result<TripPass, AppError>>;
  purchaseSubscription(): Promise<Result<SubscriptionWindow, AppError>>;
  restorePurchases(): Promise<Result<void, AppError>>;
  refresh(): Promise<void>;   // re-sync local state from RevenueCat/Supabase after app resume or purchase
}
