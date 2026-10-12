import { useCallback, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useService, useTripSessionStore } from '../core/di/ServiceContext';
import { TRIP_STORE } from '../core/di/tokens';
import type { CacheBucket } from '../core/logic/cacheFreshness';

/**
 * Stale-while-revalidate for a screen's cache buckets: cached data renders
 * immediately, and buckets that are stale or missing are refetched on focus
 * and whenever the app returns to the foreground while the screen is focused.
 *
 * `loading` is true only while a bucket has never been fetched and the first
 * attempt hasn't settled — a failed first load drops it so the screen can show
 * its error/empty state instead of spinning forever.
 */
export function useCacheRevalidation(buckets: readonly CacheBucket[]) {
  const storeApi = useService(TRIP_STORE);
  // Joined so callers can pass a fresh array every render without retriggering.
  const key = buckets.join('|');

  const run = useCallback(
    (force: boolean) => {
      const list = key ? (key.split('|') as CacheBucket[]) : [];
      return Promise.all(list.map(b => storeApi.getState().revalidate(b, { force }))).then(() => {});
    },
    [key, storeApi],
  );

  const [settledKey, setSettledKey] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void run(false).finally(() => setSettledKey(key));
      const sub = AppState.addEventListener('change', state => {
        if (state === 'active') void run(false);
      });
      return () => sub.remove();
    }, [run, key]),
  );

  const anyMissing = useTripSessionStore(s => buckets.some(b => s.fetchedAt[b] === undefined));
  const loading = anyMissing && settledKey !== key;

  const refresh = useCallback(() => run(true), [run]);

  return { loading, refresh };
}
