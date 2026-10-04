jest.mock('../supabase/supabaseClient', () => ({
  supabase: { from: jest.fn() },
}));

import { SupabaseActivityLogRepository } from '../supabase/SupabaseActivityLogRepository';
import { mockChain } from '../../__testUtils__/supabaseMockChain';
import type { ActivityEvent } from '../../core/models/ActivityEvent';

const { supabase } = require('../supabase/supabaseClient') as { supabase: { from: jest.Mock } };

function eventRow(overrides: Record<string, unknown> = {}) {
  return {
    id:            'ev1',
    event_type:    'expense.created',
    entity_type:   'expense',
    entity_id:     'exp1',
    group_id:      'g1',
    trip_id:       null,
    expense_id:    'exp1',
    actor_user_id: 'user1',
    payload:       { amount_cents: 2500 },
    created_at:    '2026-09-01T12:00:00.000Z',
    ...overrides,
  };
}

function activityEvent(overrides: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    id:          'ev1',
    eventType:   'expense.created',
    entityType:  'expense',
    entityId:    'exp1',
    groupId:     'g1',
    tripId:      null,
    expenseId:   'exp1',
    actorUserId: 'user1',
    payload:     { amount_cents: 2500 },
    createdAt:   new Date('2026-09-01T12:00:00.000Z'),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('SupabaseActivityLogRepository — appendEvent', () => {
  it('inserts the event and returns the mapped row Supabase echoes back', async () => {
    supabase.from.mockReturnValue(mockChain({ data: eventRow(), error: null }));

    const result = await new SupabaseActivityLogRepository().appendEvent(activityEvent());

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.id).toBe('ev1');
  });

  it('returns a NetworkError when the insert fails', async () => {
    supabase.from.mockReturnValue(mockChain({ data: null, error: { message: 'duplicate id' } }));

    const result = await new SupabaseActivityLogRepository().appendEvent(activityEvent());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NetworkError');
  });
});

describe('SupabaseActivityLogRepository — getEventsForGroup', () => {
  it('maps rows for the given group', async () => {
    supabase.from.mockReturnValue(mockChain({ data: [eventRow()], error: null }));

    const result = await new SupabaseActivityLogRepository().getEventsForGroup('g1');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.events).toHaveLength(1);
      expect(result.value.events[0].eventType).toBe('expense.created');
      expect(result.value.events[0].createdAt).toBeInstanceOf(Date);
    }
  });

  it('reports no next cursor when fewer rows than the limit come back', async () => {
    supabase.from.mockReturnValue(mockChain({ data: [eventRow()], error: null }));

    const result = await new SupabaseActivityLogRepository().getEventsForGroup('g1', { limit: 30 });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.nextCursor).toBeNull();
  });

  it('returns an empty page rather than an error when there are no events', async () => {
    supabase.from.mockReturnValue(mockChain({ data: [], error: null }));

    const result = await new SupabaseActivityLogRepository().getEventsForGroup('g1');

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.events).toEqual([]);
  });

  it('returns a NetworkError when the query fails', async () => {
    supabase.from.mockReturnValue(mockChain({ data: null, error: { message: 'timeout' } }));

    const result = await new SupabaseActivityLogRepository().getEventsForGroup('g1');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NetworkError');
  });
});

describe('SupabaseActivityLogRepository — getEventsForTrip', () => {
  it('maps rows for the given trip', async () => {
    supabase.from.mockReturnValue(mockChain({
      data: [eventRow({ group_id: null, trip_id: 't1' })],
      error: null,
    }));

    const result = await new SupabaseActivityLogRepository().getEventsForTrip('t1');

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.events[0].tripId).toBe('t1');
  });
});

describe('SupabaseActivityLogRepository — getEventsForUser', () => {
  it('queries with an .or() filter combining both group and trip ids', async () => {
    const chain = mockChain({ data: [eventRow()], error: null });
    supabase.from.mockReturnValue(chain);

    const result = await new SupabaseActivityLogRepository().getEventsForUser({ groupIds: ['g1', 'g2'], tripIds: ['t1'] });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.events).toHaveLength(1);
  });

  it('returns an empty page without querying when the scope is empty', async () => {
    const result = await new SupabaseActivityLogRepository().getEventsForUser({ groupIds: [], tripIds: [] });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.events).toEqual([]);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('reports no next cursor when fewer rows than the limit come back', async () => {
    supabase.from.mockReturnValue(mockChain({ data: [eventRow()], error: null }));

    const result = await new SupabaseActivityLogRepository().getEventsForUser({ groupIds: ['g1'], tripIds: [] }, { limit: 30 });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.nextCursor).toBeNull();
  });

  it('returns a NetworkError when the query fails', async () => {
    supabase.from.mockReturnValue(mockChain({ data: null, error: { message: 'timeout' } }));

    const result = await new SupabaseActivityLogRepository().getEventsForUser({ groupIds: ['g1'], tripIds: [] });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NetworkError');
  });
});

describe('SupabaseActivityLogRepository — getEventsForExpense', () => {
  it('maps rows for the given expense', async () => {
    supabase.from.mockReturnValue(mockChain({ data: [eventRow()], error: null }));

    const result = await new SupabaseActivityLogRepository().getEventsForExpense('exp1');

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(1);
  });

  it('returns a NetworkError when the query fails', async () => {
    supabase.from.mockReturnValue(mockChain({ data: null, error: { message: 'timeout' } }));

    const result = await new SupabaseActivityLogRepository().getEventsForExpense('exp1');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NetworkError');
  });
});
