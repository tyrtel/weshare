import { Platform } from 'react-native';
import Constants from 'expo-constants';
import Purchases from 'react-native-purchases';
import { ok, err } from '../../core/types/Result';
import type { Result } from '../../core/types/Result';
import type { AppError } from '../../core/types/AppError';
import type { IEntitlementService, UsageConsumeResult, CountCapFeature } from '../../core/interfaces/IEntitlementService';
import type { EntitlementStatus, SubscriptionWindow, TripPass, UsageFeature } from '../../core/models/Entitlement';
import {
  hasFullAccess as computeHasFullAccess,
  remainingFreeUses as computeRemainingFreeUses,
  resolveEntitlementSource,
} from '../../core/logic/entitlement';
import type { EntitlementState } from '../../core/logic/entitlement';
import { supabase } from '../supabase/supabaseClient';
import { logger } from '../../core/utils/logger';

// RevenueCat store product identifiers (TODO_monetization.md "Product Catalog").
// Configure matching products in Play Console / App Store Connect and attach
// them to these identifiers in the RevenueCat dashboard.
const TRIP_PASS_PRODUCT_ID = 'trip_pass_single';
const PREMIUM_MONTHLY_PRODUCT_ID = 'premium_monthly';

// Subscriber attribute set immediately before a Trip Pass purchase so the
// revenuecat-webhook Edge Function can read it back off the webhook event's
// subscriber_attributes and know which trip to attach the pass to — a
// one-time purchase's receipt carries no product-level custom metadata of
// its own, but RevenueCat subscriber attributes ride along on every event.
const PENDING_TRIP_PASS_ATTRIBUTE = 'pending_trip_pass_trip_id';

// entitlement/trip_passes/subscription_windows are populated server-side by
// the RevenueCat webhook and are the authoritative source (see "Server-Side
// Enforcement" in TODO_monetization.md) — this service reads them back from
// Supabase rather than trusting react-native-purchases' local CustomerInfo
// cache, which the SDK is used only to *drive purchases*, not to answer
// "does this user have access."
interface SubscriptionWindowRow {
  id: string;
  user_id: string;
  started_at: string;
  expires_at: string;
  store_transaction_id: string;
}

interface TripPassRow {
  id: string;
  user_id: string;
  trip_id: string;
  purchased_at: string;
  expires_at: string;
  store_transaction_id: string;
}

interface UsageRow {
  user_id: string;
  feature: string;
  used_count: number;
}

function mapSubscriptionRow(row: SubscriptionWindowRow): SubscriptionWindow {
  return {
    id: row.id,
    userId: row.user_id,
    startedAt: new Date(row.started_at),
    expiresAt: new Date(row.expires_at),
    storeTransactionId: row.store_transaction_id,
  };
}

function mapTripPassRow(row: TripPassRow): TripPass {
  return {
    id: row.id,
    userId: row.user_id,
    tripId: row.trip_id,
    purchasedAt: new Date(row.purchased_at),
    expiresAt: new Date(row.expires_at),
    storeTransactionId: row.store_transaction_id,
  };
}

function isUserCancelledError(error: unknown): boolean {
  return typeof error === 'object' && error !== null
    && (error as { userCancelled?: boolean }).userCancelled === true;
}

export class RevenueCatEntitlementService implements IEntitlementService {
  private readonly qaUnlock: boolean;
  private override = false;
  private subscription: SubscriptionWindow | null = null;
  private tripPasses: TripPass[] = [];
  private usage: Record<UsageFeature, number> = { ocr_scan: 0, report_export: 0 };

  constructor() {
    this.qaUnlock = Constants.expoConfig?.extra?.qaUnlock === true;
    // QA-unlocked builds never touch RevenueCat at all — see
    // TODO_monetization.md "The everything unlocked flags".
    if (this.qaUnlock) return;

    const apiKey = Platform.OS === 'ios'
      ? (Constants.expoConfig?.extra?.revenueCatIosApiKey as string | undefined)
      : (Constants.expoConfig?.extra?.revenueCatAndroidApiKey as string | undefined);

    if (!apiKey) {
      logger.warn('[RevenueCatEntitlementService] no RevenueCat API key configured for this platform');
    } else {
      Purchases.configure({ apiKey });
    }

    // RevenueCat's app_user_id must match users.id / auth.uid() so the
    // webhook can write trip_passes/subscription_windows against the same
    // identity our RLS policies check. Rides on the existing Supabase auth
    // session rather than requiring every screen to call identify() itself.
    supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        Purchases.logIn(session.user.id).catch(e => logger.warn('[RevenueCatEntitlementService] logIn failed', e));
      } else {
        Purchases.logOut().catch(() => {});
      }
    });
  }

  private state(): EntitlementState {
    return { override: this.override, qaUnlock: this.qaUnlock, subscription: this.subscription, tripPasses: this.tripPasses };
  }

  getStatus(): EntitlementStatus {
    return {
      source: resolveEntitlementSource(this.state(), undefined, new Date()),
      subscriptionExpiresAt: this.subscription?.expiresAt ?? null,
      usage: { ...this.usage },
    };
  }

  hasFullAccess(tripId?: string): boolean {
    return computeHasFullAccess(this.state(), tripId, new Date());
  }

  remainingFreeUses(feature: UsageFeature): number {
    return computeRemainingFreeUses(this.usage[feature], feature);
  }

  async consumeUsage(feature: UsageFeature, tripId?: string): Promise<Result<UsageConsumeResult, AppError>> {
    // QA-unlocked builds never touch RevenueCat/Supabase entitlement state —
    // without this, a QA build's real signed-in account could still be
    // blocked by the RPC if that specific account has exhausted its own free
    // tier and has no override/subscription of its own.
    if (this.qaUnlock) return ok({ allowed: true, remaining: null });

    const { data, error } = await supabase.rpc('increment_usage_if_allowed', {
      p_feature: feature,
      p_trip_id: tripId ?? null,
    });

    if (error) return err({ kind: 'NetworkError', message: error.message });

    const row = (data as { allowed: boolean; remaining: number | null }[] | null)?.[0];
    const result: UsageConsumeResult = { allowed: row?.allowed ?? false, remaining: row?.remaining ?? null };

    if (result.allowed && result.remaining !== null) {
      this.usage[feature] = Math.max(0, this.usage[feature] + 1);
    }

    return ok(result);
  }

  async canCreate(feature: CountCapFeature, groupId?: string): Promise<Result<boolean, AppError>> {
    if (this.qaUnlock) return ok(true);

    const { data, error } = feature === 'group'
      ? await supabase.rpc('can_create_group')
      : await supabase.rpc('can_create_recurring_expense', { p_group_id: groupId });

    if (error) return err({ kind: 'NetworkError', message: error.message });

    const row = (data as { allowed: boolean }[] | null)?.[0];
    return ok(row?.allowed ?? false);
  }

  async purchaseTripPass(tripId: string): Promise<Result<TripPass, AppError>> {
    try {
      await Purchases.setAttributes({ [PENDING_TRIP_PASS_ATTRIBUTE]: tripId });
      const [product] = await Purchases.getProducts([TRIP_PASS_PRODUCT_ID]);
      if (!product) return err({ kind: 'NetworkError', message: 'Trip Pass product unavailable' });
      await Purchases.purchaseStoreProduct(product);
    } catch (error) {
      if (isUserCancelledError(error)) {
        return err({ kind: 'ValidationError', field: 'purchase', message: 'Purchase cancelled' });
      }
      return err({ kind: 'NetworkError', message: error instanceof Error ? error.message : 'Purchase failed' });
    }

    const pass = await this.pollUntilPresent(() => this.fetchActiveTripPass(tripId));
    if (!pass) {
      return err({
        kind: 'NetworkError',
        message: 'Purchase succeeded but has not been confirmed yet — pull to refresh shortly.',
      });
    }
    await this.refresh();
    return ok(pass);
  }

  async purchaseSubscription(): Promise<Result<SubscriptionWindow, AppError>> {
    try {
      const [product] = await Purchases.getProducts([PREMIUM_MONTHLY_PRODUCT_ID]);
      if (!product) return err({ kind: 'NetworkError', message: 'Premium Monthly product unavailable' });
      await Purchases.purchaseStoreProduct(product);
    } catch (error) {
      if (isUserCancelledError(error)) {
        return err({ kind: 'ValidationError', field: 'purchase', message: 'Purchase cancelled' });
      }
      return err({ kind: 'NetworkError', message: error instanceof Error ? error.message : 'Purchase failed' });
    }

    const window = await this.pollUntilPresent(() => this.fetchActiveSubscription());
    if (!window) {
      return err({
        kind: 'NetworkError',
        message: 'Purchase succeeded but has not been confirmed yet — pull to refresh shortly.',
      });
    }
    await this.refresh();
    return ok(window);
  }

  async restorePurchases(): Promise<Result<void, AppError>> {
    try {
      await Purchases.restorePurchases();
    } catch (error) {
      return err({ kind: 'NetworkError', message: error instanceof Error ? error.message : 'Restore failed' });
    }
    await this.refresh();
    return ok(undefined);
  }

  async refresh(): Promise<void> {
    if (this.qaUnlock) return; // state is already fully unlocked; nothing to sync

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      this.override = false;
      this.subscription = null;
      this.tripPasses = [];
      this.usage = { ocr_scan: 0, report_export: 0 };
      return;
    }

    const [userRes, subRes, passRes, usageRes] = await Promise.all([
      supabase.from('users').select('full_access_override').eq('id', user.id).maybeSingle(),
      supabase.from('subscription_windows').select('*').eq('user_id', user.id).order('expires_at', { ascending: false }).limit(1),
      supabase.from('trip_passes').select('*').eq('user_id', user.id),
      supabase.from('user_feature_usage').select('*').eq('user_id', user.id),
    ]);

    this.override = (userRes.data as { full_access_override: boolean } | null)?.full_access_override ?? false;

    const subRow = (subRes.data as SubscriptionWindowRow[] | null)?.[0];
    this.subscription = subRow ? mapSubscriptionRow(subRow) : null;

    this.tripPasses = ((passRes.data as TripPassRow[] | null) ?? []).map(mapTripPassRow);

    const usage: Record<UsageFeature, number> = { ocr_scan: 0, report_export: 0 };
    for (const row of (usageRes.data as UsageRow[] | null) ?? []) {
      if (row.feature === 'ocr_scan' || row.feature === 'report_export') usage[row.feature] = row.used_count;
    }
    this.usage = usage;
  }

  private async fetchActiveTripPass(tripId: string): Promise<TripPass | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase
      .from('trip_passes')
      .select('*')
      .eq('user_id', user.id)
      .eq('trip_id', tripId)
      .gt('expires_at', new Date().toISOString())
      .order('purchased_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data ? mapTripPassRow(data as TripPassRow) : null;
  }

  private async fetchActiveSubscription(): Promise<SubscriptionWindow | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase
      .from('subscription_windows')
      .select('*')
      .eq('user_id', user.id)
      .gt('expires_at', new Date().toISOString())
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data ? mapSubscriptionRow(data as SubscriptionWindowRow) : null;
  }

  // The webhook write happens asynchronously after the store confirms the
  // purchase — poll briefly rather than assuming it has already landed the
  // instant purchaseStoreProduct() resolves client-side.
  private async pollUntilPresent<T>(
    fetchFn: () => Promise<T | null>,
    attempts = 8,
    intervalMs = 1000,
  ): Promise<T | null> {
    for (let i = 0; i < attempts; i++) {
      const result = await fetchFn();
      if (result) return result;
      if (i < attempts - 1) await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    return null;
  }
}
