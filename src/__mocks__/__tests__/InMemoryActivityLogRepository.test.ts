import { InMemoryActivityLogRepository } from '../InMemoryActivityLogRepository';
import type { ActivityEvent } from '../../core/models/ActivityEvent';

const T1 = new Date('2026-09-01T10:00:00Z');
const T2 = new Date('2026-09-01T11:00:00Z');
const T3 = new Date('2026-09-01T12:00:00Z');
const T4 = new Date('2026-09-01T13:00:00Z');

function makeEvent(id: string, createdAt: Date, overrides: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    id,
    eventType:   'expense.created',
    entityType:  'expense',
    entityId:    'exp-1',
    groupId:     null,
    tripId:      null,
    expenseId:   'exp-1',
    actorUserId: 'user-1',
    payload:     null,
    createdAt,
    ...overrides,
  };
}

describe('InMemoryActivityLogRepository', () => {
  describe('appendEvent', () => {
    it('adds the event and makes it retrievable', async () => {
      const repo  = new InMemoryActivityLogRepository();
      const event = makeEvent('e1', T1, { groupId: 'g1' });

      const appendResult = await repo.appendEvent(event);
      expect(appendResult.ok).toBe(true);
      if (appendResult.ok) expect(appendResult.value.id).toBe('e1');

      const result = await repo.getEventsForGroup('g1');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.events).toHaveLength(1);
    });
  });

  describe('getEventsForGroup', () => {
    it('returns only events for the given group, newest first', async () => {
      const repo = new InMemoryActivityLogRepository().seed([
        makeEvent('e1', T1, { groupId: 'g1' }),
        makeEvent('e2', T2, { groupId: 'g2' }),
        makeEvent('e3', T3, { groupId: 'g1' }),
      ]);

      const result = await repo.getEventsForGroup('g1');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.events.map(e => e.id)).toEqual(['e3', 'e1']);
    });

    it('paginates with a limit and returns a cursor when more remain', async () => {
      const repo = new InMemoryActivityLogRepository().seed([
        makeEvent('e1', T1, { groupId: 'g1' }),
        makeEvent('e2', T2, { groupId: 'g1' }),
        makeEvent('e3', T3, { groupId: 'g1' }),
      ]);

      const page1 = await repo.getEventsForGroup('g1', { limit: 2 });
      expect(page1.ok).toBe(true);
      if (!page1.ok) return;
      expect(page1.value.events.map(e => e.id)).toEqual(['e3', 'e2']);
      expect(page1.value.nextCursor).toEqual(T2);

      const page2 = await repo.getEventsForGroup('g1', { limit: 2, before: page1.value.nextCursor! });
      expect(page2.ok).toBe(true);
      if (!page2.ok) return;
      expect(page2.value.events.map(e => e.id)).toEqual(['e1']);
      expect(page2.value.nextCursor).toBeNull();
    });

    it('returns an empty page for a group with no events', async () => {
      const repo = new InMemoryActivityLogRepository();
      const result = await repo.getEventsForGroup('g1');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.events).toHaveLength(0);
        expect(result.value.nextCursor).toBeNull();
      }
    });
  });

  describe('getEventsForTrip', () => {
    it('returns only events for the given trip', async () => {
      const repo = new InMemoryActivityLogRepository().seed([
        makeEvent('e1', T1, { tripId: 't1' }),
        makeEvent('e2', T2, { tripId: 't2' }),
      ]);

      const result = await repo.getEventsForTrip('t1');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.events.map(e => e.id)).toEqual(['e1']);
    });
  });

  describe('getEventsForExpense', () => {
    it('returns all events for the given expense in reverse-chronological order', async () => {
      const repo = new InMemoryActivityLogRepository().seed([
        makeEvent('e1', T1, { expenseId: 'exp-1', eventType: 'expense.created' }),
        makeEvent('e2', T4, { expenseId: 'exp-1', eventType: 'expense.updated' }),
        makeEvent('e3', T3, { expenseId: 'exp-2', eventType: 'expense.created' }),
      ]);

      const result = await repo.getEventsForExpense('exp-1');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.map(e => e.id)).toEqual(['e2', 'e1']);
    });
  });

  describe('getEventsForUser', () => {
    it('returns events from any group or trip in scope, merged and sorted', async () => {
      const repo = new InMemoryActivityLogRepository().seed([
        makeEvent('e1', T1, { groupId: 'g1' }),
        makeEvent('e2', T2, { tripId: 't1' }),
        makeEvent('e3', T3, { groupId: 'g2' }), // not in scope
      ]);

      const result = await repo.getEventsForUser({ groupIds: ['g1'], tripIds: ['t1'] });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.events.map(e => e.id)).toEqual(['e2', 'e1']);
    });

    it('returns an empty page when the scope is empty', async () => {
      const repo = new InMemoryActivityLogRepository().seed([makeEvent('e1', T1, { groupId: 'g1' })]);
      const result = await repo.getEventsForUser({ groupIds: [], tripIds: [] });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.events).toEqual([]);
    });

    it('paginates the merged result with a cursor', async () => {
      const repo = new InMemoryActivityLogRepository().seed([
        makeEvent('e1', T1, { groupId: 'g1' }),
        makeEvent('e2', T2, { tripId: 't1' }),
        makeEvent('e3', T3, { groupId: 'g1' }),
      ]);

      const page1 = await repo.getEventsForUser({ groupIds: ['g1'], tripIds: ['t1'] }, { limit: 2 });
      expect(page1.ok).toBe(true);
      if (!page1.ok) return;
      expect(page1.value.events.map(e => e.id)).toEqual(['e3', 'e2']);

      const page2 = await repo.getEventsForUser({ groupIds: ['g1'], tripIds: ['t1'] }, { limit: 2, before: page1.value.nextCursor! });
      expect(page2.ok).toBe(true);
      if (page2.ok) expect(page2.value.events.map(e => e.id)).toEqual(['e1']);
    });
  });

  describe('seed', () => {
    it('supports method chaining', () => {
      const repo = new InMemoryActivityLogRepository();
      expect(repo.seed([])).toBe(repo);
    });
  });
});
