import type {
  INotificationService,
  NotificationPayload,
} from '../core/interfaces/INotificationService';

export class MockNotificationService implements INotificationService {
  private _permissionGranted = true;
  private _counter = 0;

  setPermissionGranted(granted: boolean): void {
    this._permissionGranted = granted;
  }

  async requestPermissions(): Promise<boolean> {
    return this._permissionGranted;
  }

  async scheduleNotification(
    _payload: NotificationPayload,
    _delayMs: number,
  ): Promise<string> {
    return `mock-notification-${++this._counter}`;
  }

  async cancelNotification(_notificationId: string): Promise<void> {}

  async cancelAllNotifications(): Promise<void> {}
}
