export type ActivityEntityType = 'expense' | 'group' | 'trip' | 'member';

export interface ActivityEvent {
  id:          string;
  eventType:   string;              // e.g. 'expense.created'
  entityType:  ActivityEntityType;
  entityId:    string;
  // Carried on every event (not just the entity's own id) so a feed row can
  // render the full group -> trip -> expense breadcrumb and each segment can
  // still link out after the child entity itself is edited or deleted.
  groupId:     string | null;
  tripId:      string | null;
  expenseId:   string | null;
  actorUserId: string;
  payload:     Record<string, unknown> | null;
  createdAt:   Date;
}
