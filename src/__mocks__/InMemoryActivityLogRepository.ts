import { ok } from '../core/types/Result';
import type { Result } from '../core/types/Result';
import type { AppError } from '../core/types/AppError';
import type { IActivityLogRepository, ActivityFeedQuery, ActivityFeedPage, ActivityFeedScope } from '../core/interfaces/IActivityLogRepository';
import type { ActivityEvent } from '../core/models/ActivityEvent';

const DEFAULT_LIMIT = 30;

function paginate(events: ActivityEvent[], query: ActivityFeedQuery = {}): ActivityFeedPage {
  const limit = query.limit ?? DEFAULT_LIMIT;
  const sorted = [...events]
    .filter(e => !query.before || e.createdAt.getTime() < query.before.getTime())
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const page = sorted.slice(0, limit);
  const nextCursor = sorted.length > limit ? page[page.length - 1].createdAt : null;
  return { events: page, nextCursor };
}

export class InMemoryActivityLogRepository implements IActivityLogRepository {
  private readonly events: ActivityEvent[] = [];

  seed(events: ActivityEvent[]): this {
    this.events.push(...events);
    return this;
  }

  appendEvent = async (event: ActivityEvent): Promise<Result<ActivityEvent, AppError>> => {
    this.events.push(event);
    return ok(event);
  };

  getEventsForGroup = async (groupId: string, query?: ActivityFeedQuery): Promise<Result<ActivityFeedPage, AppError>> => {
    return ok(paginate(this.events.filter(e => e.groupId === groupId), query));
  };

  getEventsForTrip = async (tripId: string, query?: ActivityFeedQuery): Promise<Result<ActivityFeedPage, AppError>> => {
    return ok(paginate(this.events.filter(e => e.tripId === tripId), query));
  };

  getEventsForExpense = async (expenseId: string): Promise<Result<ActivityEvent[], AppError>> => {
    const matching = this.events
      .filter(e => e.expenseId === expenseId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return ok(matching);
  };

  getEventsForUser = async (scope: ActivityFeedScope, query?: ActivityFeedQuery): Promise<Result<ActivityFeedPage, AppError>> => {
    const matching = this.events.filter(e =>
      (e.groupId !== null && scope.groupIds.includes(e.groupId)) ||
      (e.tripId !== null && scope.tripIds.includes(e.tripId)),
    );
    return ok(paginate(matching, query));
  };
}
