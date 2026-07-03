import { supabase } from './supabaseClient';
import { generateId } from '../../core/utils/generateId';
import type { INotificationService } from '../../core/interfaces/INotificationService';
import type { EnqueueNotificationInput } from '../../core/models/Notification';

export class SupabaseNotificationService implements INotificationService {
  async enqueue(input: EnqueueNotificationInput): Promise<void> {
    const { error } = await supabase.rpc('enqueue_notification', {
      p_user_id:      input.userId,
      p_channel:      input.channel,
      p_event_type:   input.eventType,
      p_payload:      input.payload,
      p_max_attempts: input.maxAttempts ?? 5,
    });
    if (error) throw new Error(error.message);
  }

  async registerDeviceToken(userId: string, token: string, platform: 'ios' | 'android'): Promise<void> {
    const { error } = await supabase.from('device_tokens' as never).upsert(
      { id: generateId(), user_id: userId, token, platform },
      { onConflict: 'user_id,token', ignoreDuplicates: true },
    );
    if (error) throw new Error(error.message);
  }

  async unregisterDeviceToken(token: string): Promise<void> {
    const { error } = await supabase.from('device_tokens' as never).delete().eq('token', token);
    if (error) throw new Error(error.message);
  }
}
