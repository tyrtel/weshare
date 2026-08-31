export interface TripPass {
  id: string;
  userId: string;
  tripId: string;
  purchasedAt: Date;
  expiresAt: Date;              // purchasedAt + 30 days, hard cap, independent of trip status
  storeTransactionId: string;
}

export interface SubscriptionWindow {
  id: string;
  userId: string;
  startedAt: Date;
  expiresAt: Date;              // max(now, currentExpiry) + 30 days on each renewal
  storeTransactionId: string;
}

export type UsageFeature = 'ocr_scan' | 'report_export';

export interface UsageCounter {
  userId: string;
  feature: UsageFeature;
  usedCount: number;            // lifetime, never resets
}

export type EntitlementSource = 'override' | 'qa_build' | 'subscription' | 'trip_pass' | 'free';

export interface EntitlementStatus {
  source: EntitlementSource;
  subscriptionExpiresAt: Date | null;
  usage: Record<UsageFeature, number>;
}
