import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { useService } from '../../../core/di/ServiceContext';
import { TRIP_STORE } from '../../../core/di/tokens';
import { bucketsForNotification } from '../../../core/logic/notificationRefresh';

/**
 * A push about a trip/group means its data changed on the server. Refresh it
 * when the notification arrives in the foreground or is tapped — covering the
 * time the app was closed, when Realtime wasn't connected.
 */
export function usePushRefresh(enabled: boolean): void {
  const storeApi = useService(TRIP_STORE);

  useEffect(() => {
    if (!enabled) return;

    const refresh = (data: Record<string, unknown> | undefined) => {
      const store = storeApi.getState();
      for (const b of bucketsForNotification(data)) store.notifyRemoteChange(b);
    };

    const received = Notifications.addNotificationReceivedListener(n => refresh(n.request.content.data));
    const opened   = Notifications.addNotificationResponseReceivedListener(r => refresh(r.notification.request.content.data));
    return () => { received.remove(); opened.remove(); };
  }, [enabled, storeApi]);
}
