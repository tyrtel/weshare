import type { ActivityEvent } from '../../../core/models/ActivityEvent';
import type { Group } from '../../../core/models/Group';
import type { Trip } from '../../../core/models/Trip';

export interface BreadcrumbSegment {
  label:    string;
  route:    string;
  linkable: boolean;
}

/**
 * Renders the group -> trip -> expense chain for a feed row. A trip-scoped
 * expense's own event never carries a groupId (expenses belong to either a
 * trip or a group, never both — see Expense.ts), so the parent group for a
 * trip must be resolved via `trip.groupId`, not `event.groupId`.
 */
export function resolveBreadcrumb(
  event: ActivityEvent,
  groups: Group[],
  trips: Trip[],
  unknownExpenseLabel: string,
): BreadcrumbSegment[] {
  const segments: BreadcrumbSegment[] = [];

  let trip: Trip | undefined;
  let group: Group | undefined;

  if (event.tripId) {
    trip = trips.find(t => t.id === event.tripId);
    if (trip?.groupId) group = groups.find(g => g.id === trip!.groupId);
  } else if (event.groupId) {
    group = groups.find(g => g.id === event.groupId);
  }

  if (group) segments.push({ label: group.name, route: `/group/${group.id}`, linkable: true });
  if (trip)  segments.push({ label: trip.name, route: `/trip/${trip.id}`, linkable: true });

  if (event.expenseId) {
    const description = (event.payload?.description as string | undefined) ?? unknownExpenseLabel;
    const route = event.groupId
      ? `/group/expense/${event.expenseId}?groupId=${event.groupId}`
      : `/expense/${event.expenseId}`;
    // A deleted expense has nothing left to navigate to.
    segments.push({ label: description, route, linkable: event.eventType !== 'expense.deleted' });
  }

  return segments;
}
