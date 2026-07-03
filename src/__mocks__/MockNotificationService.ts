import type { INotificationService } from '../core/interfaces/INotificationService';
import type { EnqueueNotificationInput } from '../core/models/Notification';

export interface DeviceTokenCall {
  userId:   string;
  token:    string;
  platform: 'ios' | 'android';
}

export class MockNotificationService implements INotificationService {
  readonly enqueueCalls:    EnqueueNotificationInput[] = [];
  readonly registerCalls:   DeviceTokenCall[]          = [];
  readonly unregisterCalls: string[]                   = [];

  async enqueue(input: EnqueueNotificationInput): Promise<void> {
    this.enqueueCalls.push({ ...input, payload: { ...input.payload } });
  }

  async registerDeviceToken(userId: string, token: string, platform: 'ios' | 'android'): Promise<void> {
    this.registerCalls.push({ userId, token, platform });
  }

  async unregisterDeviceToken(token: string): Promise<void> {
    this.unregisterCalls.push(token);
  }
}
