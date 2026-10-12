import { supabase } from './supabaseClient';
import { REALTIME_TABLES, type IRealtimeService, type RemoteChange } from '../../core/interfaces/IRealtimeService';

export class SupabaseRealtimeService implements IRealtimeService {
  subscribe(onChange: (change: RemoteChange) => void): () => void {
    let channel = supabase.channel('weshare-db-changes');
    for (const table of REALTIME_TABLES) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        payload => onChange({
          table,
          type: payload.eventType,
          row:  payload.eventType === 'DELETE' ? null : payload.new,
          old:  payload.eventType === 'DELETE' ? payload.old : null,
        }),
      );
    }
    channel.subscribe();
    return () => { void supabase.removeChannel(channel); };
  }
}
