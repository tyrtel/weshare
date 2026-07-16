import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { useService } from '../../../core/di/ServiceContext';
import { AUTH, NOTIFICATION_SERVICE } from '../../../core/di/tokens';

export function useRegisterPushToken(): void {
  const auth                = useService(AUTH);
  const notificationService = useService(NOTIFICATION_SERVICE);

  useEffect(() => {
    async function register(): Promise<void> {
      const user = auth.currentUser();
      if (!user) return;

      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') return;

      const { data: token } = await Notifications.getExpoPushTokenAsync();
      const platform = Platform.OS === 'ios' ? 'ios' : 'android';
      await notificationService.registerDeviceToken(user.id, token, platform);
    }
    register().catch(() => {});
  }, [auth, notificationService]);

  useEffect(() => {
    const unsub = auth.onAuthStateChange(user => {
      if (user) return;

      async function unregister(): Promise<void> {
        const { status } = await Notifications.getPermissionsAsync();
        if (status !== 'granted') return;

        const { data: token } = await Notifications.getExpoPushTokenAsync();
        await notificationService.unregisterDeviceToken(token);
      }
      unregister().catch(() => {});
    });
    return unsub;
  }, [auth, notificationService]);
}
