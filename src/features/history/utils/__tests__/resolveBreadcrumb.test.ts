import { resolveBreadcrumb } from '../resolveBreadcrumb';
import type { ActivityEvent } from '../../../../core/models/ActivityEvent';
import type { Group } from '../../../../core/models/Group';
import type { Trip } from '../../../../core/models/Trip';

const UNKNOWN = 'an expense';

function makeEvent(overrides: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    id: 'e1',
    eventType: 'expense.created',
    entityType: 'expense',
    entityId: 'exp1',
    groupId: null,
    tripId: null,
    expenseId: 'exp1',
    actorUserId: 'u1',
    payload: { description: 'Dinner' },
    createdAt: new Date('2026-09-01T12:00:00Z'),
    ...overrides,
  };
}

const group: Group = {
  id: 'g1', name: 'Roomies', currency: 'EUR', ownerId: 'u1', createdAt: new Date(), members: [],
};

const standaloneTrip: Trip = {
  id: 't1', name: 'Lisbon', currency: 'EUR', createdAt: new Date(), ownerId: 'u1', members: [],
  status: 'active', closedAt: null,
};

const tripInGroup: Trip = { ...standaloneTrip, id: 't2', name: 'Ski trip', groupId: 'g1' };

describe('resolveBreadcrumb', () => {
  it('a direct group expense yields group -> expense', () => {
    const segments = resolveBreadcrumb(
      makeEvent({ groupId: 'g1', tripId: null }),
      [group], [],
      UNKNOWN,
    );
    expect(segments.map(s => s.label)).toEqual(['Roomies', 'Dinner']);
    expect(segments[0].route).toBe('/group/g1');
    expect(segments[1].route).toBe('/group/expense/exp1?groupId=g1');
  });

  it('a standalone trip expense yields trip -> expense, no group segment', () => {
    const segments = resolveBreadcrumb(
      makeEvent({ groupId: null, tripId: 't1' }),
      [group], [standaloneTrip],
      UNKNOWN,
    );
    expect(segments.map(s => s.label)).toEqual(['Lisbon', 'Dinner']);
    expect(segments[0].route).toBe('/trip/t1');
    expect(segments[1].route).toBe('/expense/exp1');
  });

  it('a trip that belongs to a group yields group -> trip -> expense', () => {
    const segments = resolveBreadcrumb(
      makeEvent({ groupId: null, tripId: 't2' }),
      [group], [tripInGroup],
      UNKNOWN,
    );
    expect(segments.map(s => s.label)).toEqual(['Roomies', 'Ski trip', 'Dinner']);
  });

  it('the expense segment is not linkable for a deleted expense', () => {
    const segments = resolveBreadcrumb(
      makeEvent({ groupId: 'g1', eventType: 'expense.deleted' }),
      [group], [],
      UNKNOWN,
    );
    expect(segments[1].linkable).toBe(false);
    expect(segments[0].linkable).toBe(true);
  });

  it('falls back to the unknown-expense label when payload has no description', () => {
    const segments = resolveBreadcrumb(
      makeEvent({ groupId: 'g1', payload: null }),
      [group], [],
      UNKNOWN,
    );
    expect(segments[1].label).toBe(UNKNOWN);
  });

  it('omits a segment for an entity that cannot be found', () => {
    const segments = resolveBreadcrumb(
      makeEvent({ groupId: 'missing-group' }),
      [], [],
      UNKNOWN,
    );
    expect(segments.map(s => s.label)).toEqual(['Dinner']);
  });
});
