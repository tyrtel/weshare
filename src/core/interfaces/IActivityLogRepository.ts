import type { Result } from '../types/Result';
import type { AppError } from '../types/AppError';
import type { ActivityEvent } from '../models/ActivityEvent';

export interface ActivityFeedQuery {
  limit?:  number;   // defaults to 30
  before?: Date;      // cursor: only events strictly older than this
}

export interface ActivityFeedPage {
  events:      ActivityEvent[];
  nextCursor:  Date | null;  // pass as `before` to fetch the next page; null when exhausted
}

// The caller's own group/trip memberships (already available for free at the
// call site via useGroups()/useTrips() — see useActivityFeed). Passing this
// explicitly, rather than resolving membership again inside the repository,
// keeps IActivityLogRepository from needing to know about groups/trips at
// all beyond these two id arrays, and matches how getTripsForUser/
// getGroupsForUser etc. already take an explicit userId rather than relying
// solely on RLS to scope a query. RLS on activity_events enforces the same
// membership check independently, so a caller passing the wrong ids (or none)
// can only ever narrow results, never see events it isn't entitled to.
export interface ActivityFeedScope {
  groupIds: string[];
  tripIds:  string[];
}

export interface IActivityLogRepository {
  appendEvent(event: ActivityEvent): Promise<Result<ActivityEvent, AppError>>;
  getEventsForGroup(groupId: string, query?: ActivityFeedQuery): Promise<Result<ActivityFeedPage, AppError>>;
  getEventsForTrip(tripId: string, query?: ActivityFeedQuery): Promise<Result<ActivityFeedPage, AppError>>;
  getEventsForExpense(expenseId: string): Promise<Result<ActivityEvent[], AppError>>;
  // Single merged, sorted, cursor-paginated query across every group and trip
  // in `scope` — the server does the union + ordering, not N per-source
  // fetches merged client-side.
  getEventsForUser(scope: ActivityFeedScope, query?: ActivityFeedQuery): Promise<Result<ActivityFeedPage, AppError>>;
}
