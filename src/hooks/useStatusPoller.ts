import { useEffect, useLayoutEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import type { SplitRequestStatus } from '../core/models/SplitRequest';

const TERMINAL: readonly SplitRequestStatus[] = ['completed', 'declined', 'expired'];

/**
 * Polls `getStatus` on a fixed interval and on AppState foreground transitions.
 * Stops automatically when a terminal status (completed/declined/expired) is returned.
 *
 * @param getStatus  Async fn that returns the current status, or null if not ready.
 * @param intervalMs Polling interval in milliseconds.
 * @param onStatusChange Called whenever a non-null status is received.
 * @param enabled    Set to false to skip setup entirely (default: true).
 */
export function useStatusPoller(
  getStatus: () => Promise<SplitRequestStatus | null>,
  intervalMs: number,
  onStatusChange: (status: SplitRequestStatus) => void,
  enabled = true,
): void {
  // Stable refs so the interval/AppState callback always calls the latest
  // props without restarting the polling cycle on every render.
  const getStatusRef      = useRef(getStatus);
  const onStatusChangeRef = useRef(onStatusChange);
  // Keep refs in sync with the latest props without restarting the polling cycle.
  // useLayoutEffect fires synchronously after every render before the next tick,
  // so the interval callback always sees the current function reference.
  useLayoutEffect(() => {
    getStatusRef.current      = getStatus;
    onStatusChangeRef.current = onStatusChange;
  });

  const pollingRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef  = useRef<AppStateStatus>(AppState.currentState);
  const stoppedRef   = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    stoppedRef.current = false;

    const poll = async () => {
      if (stoppedRef.current) return;
      const status = await getStatusRef.current();
      if (status === null) return;
      onStatusChangeRef.current(status);
      if (TERMINAL.includes(status)) {
        stoppedRef.current = true;
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      }
    };

    pollingRef.current = setInterval(() => void poll(), intervalMs);

    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      const prev = appStateRef.current;
      if ((prev === 'background' || prev === 'inactive') && nextState === 'active') {
        void poll();
      }
      appStateRef.current = nextState;
    });

    return () => {
      stoppedRef.current = true;
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      sub.remove();
    };
  }, [intervalMs, enabled]);
}
