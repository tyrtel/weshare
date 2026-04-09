export interface NotificationPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface INotificationService {
  /** Asks the OS for notification permissions. Returns true if granted. */
  requestPermissions(): Promise<boolean>;
  /** Schedules a local notification to fire after `delayMs` milliseconds. Returns the notification ID. */
  scheduleNotification(payload: NotificationPayload, delayMs: number): Promise<string>;
  cancelNotification(notificationId: string): Promise<void>;
  cancelAllNotifications(): Promise<void>;
}
