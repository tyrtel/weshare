import { ok, err } from '../../core/types/Result';
import type { Result } from '../../core/types/Result';
import type { AppError } from '../../core/types/AppError';
import type { IActivityLogRepository, ActivityFeedQuery, ActivityFeedPage, ActivityFeedScope } from '../../core/interfaces/IActivityLogRepository';
import type { ActivityEvent, ActivityEntityType } from '../../core/models/ActivityEvent';
import { supabase } from './supabaseClient';
import { toAppError } from './supabaseErrors';

const DEFAULT_LIMIT = 30;

function rowToEvent(row: Record<string, unknown>): ActivityEvent {
  return {
    id:          row.id as string,
    eventType:   row.event_type as string,
    entityType:  row.entity_type as ActivityEntityType,
    entityId:    row.entity_id as string,
    groupId:     (row.group_id as string | null) ?? null,
    tripId:      (row.trip_id as string | null) ?? null,
    expenseId:   (row.expense_id as string | null) ?? null,
    actorUserId: row.actor_user_id as string,
    payload:     (row.payload as Record<string, unknown> | null) ?? null,
    createdAt:   new Date(row.created_at as string),
  };
}

function eventToRow(event: ActivityEvent): Record<string, unknown> {
  return {
    id:            event.id,
    event_type:    event.eventType,
    entity_type:   event.entityType,
    entity_id:     event.entityId,
    group_id:      event.groupId,
    trip_id:       event.tripId,
    expense_id:    event.expenseId,
    actor_user_id: event.actorUserId,
    payload:       event.payload,
    created_at:    event.createdAt.toISOString(),
  };
}

// Shared "slice to limit, compute the next cursor" tail for every paginated
// query below — each caller runs its own filtered query (a group/trip/user
// scope) and hands the raw rows here rather than sharing a query builder,
// which this table's untyped Database entry (see the module's own gap noted
// in productionContainer.ts) makes awkward to type usefully anyway.
function toActivityFeedPage(rows: Record<string, unknown>[], limit: number): ActivityFeedPage {
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit).map(rowToEvent);
  return { events: page, nextCursor: hasMore ? page[page.length - 1].createdAt : null };
}

// PostgREST .in.() syntax rejects an empty list, so an empty id array must
// drop that clause rather than send `group_id.in.()`.
function scopeFilter(scope: ActivityFeedScope): string | null {
  const clauses: string[] = [];
  if (scope.groupIds.length > 0) clauses.push(`group_id.in.(${scope.groupIds.join(',')})`);
  if (scope.tripIds.length > 0)  clauses.push(`trip_id.in.(${scope.tripIds.join(',')})`);
  return clauses.length > 0 ? clauses.join(',') : null;
}

async function fetchPage(
  column: 'group_id' | 'trip_id',
  id: string,
  query: ActivityFeedQuery = {},
): Promise<Result<ActivityFeedPage, AppError>> {
  const limit = query.limit ?? DEFAULT_LIMIT;
  let builder = supabase
    .from('activity_events')
    .select('*')
    .eq(column, id)
    .order('created_at', { ascending: false })
    .limit(limit + 1);

  if (query.before) {
    builder = builder.lt('created_at', query.before.toISOString());
  }

  const { data, error } = await builder;
  if (error) return err(toAppError(error, 'ActivityEvent'));
  return ok(toActivityFeedPage((data ?? []) as Record<string, unknown>[], limit));
}

export class SupabaseActivityLogRepository implements IActivityLogRepository {
  async appendEvent(event: ActivityEvent): Promise<Result<ActivityEvent, AppError>> {
    const { data, error } = await supabase
      .from('activity_events')
      .insert(eventToRow(event))
      .select()
      .single();

    if (error) return err(toAppError(error, 'ActivityEvent'));
    return ok(rowToEvent(data as Record<string, unknown>));
  }

  getEventsForGroup(groupId: string, query?: ActivityFeedQuery): Promise<Result<ActivityFeedPage, AppError>> {
    return fetchPage('group_id', groupId, query);
  }

  getEventsForTrip(tripId: string, query?: ActivityFeedQuery): Promise<Result<ActivityFeedPage, AppError>> {
    return fetchPage('trip_id', tripId, query);
  }

  async getEventsForExpense(expenseId: string): Promise<Result<ActivityEvent[], AppError>> {
    const { data, error } = await supabase
      .from('activity_events')
      .select('*')
      .eq('expense_id', expenseId)
      .order('created_at', { ascending: false });

    if (error) return err(toAppError(error, 'ActivityEvent'));
    return ok((data ?? []).map(rowToEvent));
  }

  async getEventsForUser(scope: ActivityFeedScope, query: ActivityFeedQuery = {}): Promise<Result<ActivityFeedPage, AppError>> {
    const filter = scopeFilter(scope);
    if (!filter) return ok({ events: [], nextCursor: null });

    const limit = query.limit ?? DEFAULT_LIMIT;
    let builder = supabase
      .from('activity_events')
      .select('*')
      .or(filter)
      .order('created_at', { ascending: false })
      .limit(limit + 1);

    if (query.before) {
      builder = builder.lt('created_at', query.before.toISOString());
    }

    const { data, error } = await builder;
    if (error) return err(toAppError(error, 'ActivityEvent'));
    return ok(toActivityFeedPage((data ?? []) as Record<string, unknown>[], limit));
  }
}
