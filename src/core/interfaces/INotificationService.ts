import type { EnqueueNotificationInput } from '../models/Notification';

export interface INotificationService {
  enqueue(input: EnqueueNotificationInput): Promise<void>;
  registerDeviceToken(userId: string, token: string, platform: 'ios' | 'android'): Promise<void>;
  unregisterDeviceToken(token: string): Promise<void>;
}
