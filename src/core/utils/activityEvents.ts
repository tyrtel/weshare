import { generateId } from './generateId';
import type { ActivityEvent, ActivityEntityType } from '../models/ActivityEvent';

export interface NewActivityEventInput {
  eventType:   string;
  entityType:  ActivityEntityType;
  entityId:    string;
  groupId?:    string | null;
  tripId?:     string | null;
  expenseId?:  string | null;
  actorUserId: string;
  payload?:    Record<string, unknown> | null;
}

export function newActivityEvent(input: NewActivityEventInput): ActivityEvent {
  return {
    id:          generateId(),
    eventType:   input.eventType,
    entityType:  input.entityType,
    entityId:    input.entityId,
    groupId:     input.groupId ?? null,
    tripId:      input.tripId ?? null,
    expenseId:   input.expenseId ?? null,
    actorUserId: input.actorUserId,
    payload:     input.payload ?? null,
    createdAt:   new Date(),
  };
}
