import { InMemoryAuditLogRepository } from '../InMemoryAuditLogRepository';
import type { AuditEvent } from '../../core/models/AuditEvent';

const T1 = new Date('2025-06-01T10:00:00Z');
const T2 = new Date('2025-06-01T11:00:00Z');
const T3 = new Date('2025-06-01T12:00:00Z');

function makeEvent(id: string, entityId: string, createdAt: Date, overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id,
    entityType: 'split_request',
    entityId,
    eventType:  'stripe.checkout.completed',
    payload:    null,
    createdAt,
    ...overrides,
  };
}

describe('InMemoryAuditLogRepository', () => {
  describe('getEventsForRequest', () => {
    it('returns only events matching the given splitRequestId', async () => {
      const repo = new InMemoryAuditLogRepository().seed([
        makeEvent('e1', 'req-a', T1),
        makeEvent('e2', 'req-b', T2),
        makeEvent('e3', 'req-a', T3),
      ]);

      const result = await repo.getEventsForRequest('req-a');
      expect(result.ok).toBe(true);
      if (result.ok) {
        const ids = result.value.map(e => e.id);
        expect(ids).toContain('e1');
        expect(ids).toContain('e3');
        expect(ids).not.toContain('e2');
      }
    });

    it('returns events in reverse-chronological order', async () => {
      const repo = new InMemoryAuditLogRepository().seed([
        makeEvent('old', 'req-a', T1),
        makeEvent('mid', 'req-a', T2),
        makeEvent('new', 'req-a', T3),
      ]);

      const result = await repo.getEventsForRequest('req-a');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.map(e => e.id)).toEqual(['new', 'mid', 'old']);
      }
    });

    it('returns an empty array when no events match', async () => {
      const repo = new InMemoryAuditLogRepository().seed([
        makeEvent('e1', 'req-b', T1),
      ]);

      const result = await repo.getEventsForRequest('req-a');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(0);
      }
    });

    it('returns an empty array for an empty repository', async () => {
      const repo = new InMemoryAuditLogRepository();

      const result = await repo.getEventsForRequest('req-a');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(0);
      }
    });
  });

  describe('appendEvent', () => {
    it('adds the event and makes it retrievable', async () => {
      const repo  = new InMemoryAuditLogRepository();
      const event = makeEvent('e1', 'req-a', T1);

      const appendResult = await repo.appendEvent(event);
      expect(appendResult.ok).toBe(true);
      if (appendResult.ok) {
        expect(appendResult.value.id).toBe('e1');
      }

      const getResult = await repo.getEventsForRequest('req-a');
      expect(getResult.ok).toBe(true);
      if (getResult.ok) {
        expect(getResult.value).toHaveLength(1);
        expect(getResult.value[0].id).toBe('e1');
      }
    });

    it('preserves all fields of the appended event', async () => {
      const repo  = new InMemoryAuditLogRepository();
      const event = makeEvent('e1', 'req-a', T1, {
        eventType: 'ob.payment.authorized',
        payload:   { status: 'AUTHENTICATED', paymentId: 'tink_123' },
      });

      await repo.appendEvent(event);
      const result = await repo.getEventsForRequest('req-a');
      expect(result.ok).toBe(true);
      if (result.ok) {
        const stored = result.value[0];
        expect(stored.eventType).toBe('ob.payment.authorized');
        expect(stored.payload).toEqual({ status: 'AUTHENTICATED', paymentId: 'tink_123' });
      }
    });

    it('accumulates multiple appended events', async () => {
      const repo = new InMemoryAuditLogRepository();
      await repo.appendEvent(makeEvent('e1', 'req-a', T1));
      await repo.appendEvent(makeEvent('e2', 'req-a', T2));
      await repo.appendEvent(makeEvent('e3', 'req-a', T3));

      const result = await repo.getEventsForRequest('req-a');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(3);
      }
    });
  });

  describe('seed', () => {
    it('supports method chaining', () => {
      const repo = new InMemoryAuditLogRepository();
      expect(repo.seed([])).toBe(repo);
    });

    it('accepts events for multiple entity IDs', async () => {
      const repo = new InMemoryAuditLogRepository().seed([
        makeEvent('e1', 'req-a', T1),
        makeEvent('e2', 'req-b', T1),
      ]);

      const a = await repo.getEventsForRequest('req-a');
      const b = await repo.getEventsForRequest('req-b');
      expect(a.ok && a.value).toHaveLength(1);
      expect(b.ok && b.value).toHaveLength(1);
    });
  });
});
