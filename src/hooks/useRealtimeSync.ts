import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useService } from '../core/di/ServiceContext';
import { REALTIME, TRIP_STORE } from '../core/di/tokens';
import { bucketsForChange } from '../core/logic/remoteChanges';

/**
 * While signed in and in the foreground, streams other members' changes and
 * refreshes the affected cache buckets. In the background the stream is
 * closed; coming back revalidates stale buckets anyway (useCacheRevalidation).
 */
export function useRealtimeSync(enabled: boolean) {
  const realtime = useService(REALTIME);
  const storeApi = useService(TRIP_STORE);

  useEffect(() => {
    if (!enabled) return;

    let stop: (() => void) | null = null;
    const start = () => {
      stop ??= realtime.subscribe(change => {
        const store = storeApi.getState();
        for (const b of bucketsForChange(change, store)) store.notifyRemoteChange(b);
      });
    };
    const halt = () => { stop?.(); stop = null; };

    if (AppState.currentState === 'active') start();
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') start();
      else if (state === 'background') halt();
    });
    return () => { sub.remove(); halt(); };
  }, [enabled, realtime, storeApi]);
}
