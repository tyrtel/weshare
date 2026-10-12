import { useTripSessionStore } from '../core/di/ServiceContext';
import { freshness, type CacheBucket } from '../core/logic/cacheFreshness';

/**
 * True while any of these buckets was last fetched longer ago than
 * FORCE_SYNC_MS. Screens show cached data meanwhile but must not let the user
 * pay, settle or delete against balances that may be out of date.
 */
export function useCacheExpired(buckets: readonly CacheBucket[]): boolean {
  return useTripSessionStore(s => buckets.some(b => freshness(s.fetchedAt[b], Date.now()) === 'expired'));
}
