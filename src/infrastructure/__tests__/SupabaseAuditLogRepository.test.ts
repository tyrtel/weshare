jest.mock('../supabase/supabaseClient', () => ({
  supabase: { from: jest.fn() },
}));

import { SupabaseAuditLogRepository } from '../supabase/SupabaseAuditLogRepository';
import { mockChain } from '../../__testUtils__/supabaseMockChain';
import type { AuditEvent } from '../../core/models/AuditEvent';

const { supabase } = require('../supabase/supabaseClient') as { supabase: { from: jest.Mock } };

function auditEventRow(overrides: Record<string, unknown> = {}) {
  return {
    id:          'ev1',
    entity_type: 'split_request',
    entity_id:   'sr1',
    event_type:  'stripe.checkout.completed',
    payload:     { amount_cents: 2500 },
    created_at:  '2026-07-01T12:00:00.000Z',
    ...overrides,
  };
}

function auditEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id:         'ev1',
    entityType: 'split_request',
    entityId:   'sr1',
    eventType:  'stripe.checkout.completed',
    payload:    { amount_cents: 2500 },
    createdAt:  new Date('2026-07-01T12:00:00.000Z'),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('SupabaseAuditLogRepository — getEventsForRequest', () => {
  it('maps rows for the given split request', async () => {
    supabase.from.mockReturnValue(mockChain({ data: [auditEventRow()], error: null }));

    const result = await new SupabaseAuditLogRepository().getEventsForRequest('sr1');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0].eventType).toBe('stripe.checkout.completed');
      expect(result.value[0].payload).toEqual({ amount_cents: 2500 });
      expect(result.value[0].createdAt).toBeInstanceOf(Date);
    }
  });

  it('maps a null payload through as null rather than throwing', async () => {
    supabase.from.mockReturnValue(mockChain({ data: [auditEventRow({ payload: null })], error: null }));

    const result = await new SupabaseAuditLogRepository().getEventsForRequest('sr1');

    if (result.ok) expect(result.value[0].payload).toBeNull();
  });

  it('returns an empty list rather than an error when there are no events', async () => {
    supabase.from.mockReturnValue(mockChain({ data: [], error: null }));

    const result = await new SupabaseAuditLogRepository().getEventsForRequest('sr1');

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('returns a NetworkError when the query fails', async () => {
    supabase.from.mockReturnValue(mockChain({ data: null, error: { message: 'timeout' } }));

    const result = await new SupabaseAuditLogRepository().getEventsForRequest('sr1');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NetworkError');
  });
});

describe('SupabaseAuditLogRepository — appendEvent', () => {
  it('inserts the event and returns the mapped row Supabase echoes back', async () => {
    supabase.from.mockReturnValue(mockChain({ data: auditEventRow(), error: null }));

    const result = await new SupabaseAuditLogRepository().appendEvent(auditEvent());

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.id).toBe('ev1');
  });

  it('returns a NetworkError when the insert fails', async () => {
    supabase.from.mockReturnValue(mockChain({ data: null, error: { message: 'duplicate id' } }));

    const result = await new SupabaseAuditLogRepository().appendEvent(auditEvent());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NetworkError');
  });
});
