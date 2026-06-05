import { ok, err } from '../../core/types/Result';
import type { Result } from '../../core/types/Result';
import type { AppError } from '../../core/types/AppError';
import type { IAuditLogRepository } from '../../core/interfaces/IAuditLogRepository';
import type { AuditEvent } from '../../core/models/AuditEvent';
import { supabase } from './supabaseClient';
import { toAppError } from './supabaseErrors';

function rowToEvent(row: Record<string, unknown>): AuditEvent {
  return {
    id:         row.id as string,
    entityType: row.entity_type as string,
    entityId:   row.entity_id as string,
    eventType:  row.event_type as string,
    payload:    (row.payload as Record<string, unknown> | null) ?? null,
    createdAt:  new Date(row.created_at as string),
  };
}

export class SupabaseAuditLogRepository implements IAuditLogRepository {
  async getEventsForRequest(splitRequestId: string): Promise<Result<AuditEvent[], AppError>> {
    const { data, error } = await supabase
      .from('audit_log')
      .select('*')
      .eq('entity_id', splitRequestId)
      .order('created_at', { ascending: false });

    if (error) return err(toAppError(error));
    return ok((data ?? []).map(rowToEvent));
  }

  async appendEvent(event: AuditEvent): Promise<Result<AuditEvent, AppError>> {
    const { data, error } = await supabase
      .from('audit_log')
      .insert({
        id:          event.id,
        entity_type: event.entityType,
        entity_id:   event.entityId,
        event_type:  event.eventType,
        payload:     event.payload,
        created_at:  event.createdAt.toISOString(),
      })
      .select()
      .single();

    if (error) return err(toAppError(error));
    return ok(rowToEvent(data as Record<string, unknown>));
  }
}
