import type {
  INotificationService,
  NotificationPayload,
} from '../../core/interfaces/INotificationService';

/**
 * No-op notification service used in production until a real push notification
 * integration (e.g. expo-notifications) is wired up.
 */
export class StubNotificationService implements INotificationService {
  async requestPermissions(): Promise<boolean> {
    return false;
  }

  async scheduleNotification(
    _payload: NotificationPayload,
    _delayMs: number,
  ): Promise<string> {
    return '';
  }

  async cancelNotification(_notificationId: string): Promise<void> {}

  async cancelAllNotifications(): Promise<void> {}
}
