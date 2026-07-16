export type NotificationChannel = 'push' | 'email' | 'sms' | 'whatsapp';

export type NotificationEventType =
  | 'expense_added'
  | 'expense_settled'
  | 'group_invite'
  | 'debt_owed'
  | 'payment_request'
  | 'payment_failed';

export interface EnqueueNotificationInput {
  userId:      string;
  channel:     NotificationChannel;
  eventType:   NotificationEventType;
  payload:     Record<string, unknown>;
  maxAttempts?: number;
}
