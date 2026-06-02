// Mock the supabase client before any imports that pull it in.
jest.mock('../supabase/supabaseClient', () => ({
  supabase: { from: jest.fn() },
}));

import { SupabaseTripRepository } from '../supabase/SupabaseTripRepository';
import { SupabaseSplitRepository } from '../supabase/SupabaseSplitRepository';
import { SupabaseExpenseRepository } from '../supabase/SupabaseExpenseRepository';
import { SupabaseMemberRepository } from '../supabase/SupabaseMemberRepository';

// ── Helpers ───────────────────────────────────────────────────────────────────

const { supabase } = require('../supabase/supabaseClient') as {
  supabase: { from: jest.Mock };
};

/**
 * Build a chainable Supabase query mock that resolves with `result` at the end.
 * Every method in the chain returns `this` except the terminal call which
 * returns a Promise.
 */
function mockChain(result: { data: unknown; error: null | { message: string; code?: string } }) {
  const terminal = jest.fn().mockResolvedValue(result);
  const chain: Record<string, unknown> = {};
  const proxy = new Proxy(chain, {
    get(_target, prop: string) {
      if (prop === 'then' || prop === 'catch' || prop === 'finally') {
        return terminal().then.bind(terminal());
      }
      if (['single', 'maybeSingle'].includes(prop)) return terminal;
      return () => proxy;
    },
  });

  // Also allow awaiting the chain itself (for non-.single() calls like .select())
  const asyncChain = new Proxy(chain, {
    get(_target, prop: string) {
      if (prop === 'then') return (res: unknown, rej: unknown) => terminal().then(res, rej);
      if (prop === 'catch') return (fn: unknown) => terminal().catch(fn);
      if (prop === 'finally') return (fn: unknown) => terminal().finally(fn);
      if (['single', 'maybeSingle'].includes(prop)) return terminal;
      return () => asyncChain;
    },
  });

  return asyncChain;
}

// ── SupabaseTripRepository — row mapping ──────────────────────────────────────

describe('SupabaseTripRepository — row mapping', () => {
  it('maps required trip fields from a Supabase row', async () => {
    const tripRow = {
      id: 't1', name: 'Chez Paul', currency: 'EUR',
      owner_id: 'u1', created_at: '2025-06-01T12:00:00Z', invite_token: 'abc12345',
      trip_members: [],
    };
    supabase.from.mockReturnValue(mockChain({ data: tripRow, error: null }));
    const result = await new SupabaseTripRepository().getTrip('t1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.id).toBe('t1');
      expect(result.value.name).toBe('Chez Paul');
      expect(result.value.currency).toBe('EUR');
      expect(result.value.ownerId).toBe('u1');
      expect(result.value.createdAt).toBeInstanceOf(Date);
    }
  });

  it('maps inviteToken from snake_case', async () => {
    const tripRow = {
      id: 't1', name: 'Trip', currency: 'EUR', owner_id: 'u1',
      created_at: '2025-06-01T12:00:00Z', invite_token: 'abc12345', trip_members: [],
    };
    supabase.from.mockReturnValue(mockChain({ data: tripRow, error: null }));
    const result = await new SupabaseTripRepository().getTrip('t1');
    if (result.ok) expect(result.value.inviteToken).toBe('abc12345');
  });

  it('sets inviteToken to undefined when null', async () => {
    const tripRow = {
      id: 't1', name: 'Trip', currency: 'EUR', owner_id: 'u1',
      created_at: '2025-06-01T12:00:00Z', invite_token: null, trip_members: [],
    };
    supabase.from.mockReturnValue(mockChain({ data: tripRow, error: null }));
    const result = await new SupabaseTripRepository().getTrip('t1');
    if (result.ok) expect(result.value.inviteToken).toBeUndefined();
  });

  it('embeds members from trip_members rows', async () => {
    const tripRow = {
      id: 't1', name: 'Trip', currency: 'EUR', owner_id: 'u1',
      created_at: '2025-06-01T12:00:00Z', invite_token: null,
      trip_members: [
        { trip_id: 't1', user_id: 'u2', display_name: 'Marie', is_guest: false, joined_at: '2025-06-01T12:00:00Z' },
      ],
    };
    supabase.from.mockReturnValue(mockChain({ data: tripRow, error: null }));
    const result = await new SupabaseTripRepository().getTrip('t1');
    if (result.ok) {
      expect(result.value.members).toHaveLength(1);
      expect(result.value.members[0].displayName).toBe('Marie');
    }
  });
});

// ── SupabaseMemberRepository — row mapping ────────────────────────────────────

describe('SupabaseMemberRepository — row mapping', () => {
  it('maps member fields from a Supabase row', async () => {
    supabase.from.mockReturnValue(mockChain({
      data: [{ trip_id: 't1', user_id: 'u1', display_name: 'Jay', is_guest: false, joined_at: '2025-06-01T12:00:00Z' }],
      error: null,
    }));
    const result = await new SupabaseMemberRepository().getMembersForTrip('t1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0].tripId).toBe('t1');
      expect(result.value[0].userId).toBe('u1');
      expect(result.value[0].displayName).toBe('Jay');
      expect(result.value[0].isGuest).toBe(false);
      expect(result.value[0].joinedAt).toBeInstanceOf(Date);
    }
  });
});

// ── SupabaseSplitRepository — row mapping ─────────────────────────────────────

describe('SupabaseSplitRepository — row mapping', () => {
  it('maps unsettled split fields', async () => {
    supabase.from.mockReturnValue(mockChain({
      data: { id: 's1', expense_id: 'e1', user_id: 'u1', amount_owed_cents: 3700, amount_paid_cents: 0, settled_at: null },
      error: null,
    }));
    const result = await new SupabaseSplitRepository().getSplit('s1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.amountOwedCents).toBe(3700);
      expect(result.value.amountPaidCents).toBe(0);
      expect(result.value.settledAt).toBeUndefined();
    }
  });

  it('maps settled_at to Date when present', async () => {
    supabase.from.mockReturnValue(mockChain({
      data: { id: 's2', expense_id: 'e1', user_id: 'u2', amount_owed_cents: 2500, amount_paid_cents: 2500, settled_at: '2025-06-05T09:00:00Z' },
      error: null,
    }));
    const result = await new SupabaseSplitRepository().getSplit('s2');
    if (result.ok) expect(result.value.settledAt).toBeInstanceOf(Date);
  });
});

// ── SupabaseExpenseRepository — row mapping ───────────────────────────────────

describe('SupabaseExpenseRepository — row mapping', () => {
  it('maps totalAmountCents as integer', async () => {
    supabase.from.mockReturnValue(mockChain({
      data: {
        id: 'e1', trip_id: 't1', description: 'Food', total_amount_cents: 14800,
        currency: 'EUR', paid_by_user_id: 'u1', created_at: '2025-06-01T12:00:00Z',
        metadata: {}, splits: [],
      },
      error: null,
    }));
    const result = await new SupabaseExpenseRepository().getExpense('e1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.totalAmountCents).toBe(14800);
      expect(Number.isInteger(result.value.totalAmountCents)).toBe(true);
    }
  });

  it('embeds splits from nested splits rows', async () => {
    supabase.from.mockReturnValue(mockChain({
      data: {
        id: 'e1', trip_id: 't1', description: 'Food', total_amount_cents: 3700,
        currency: 'EUR', paid_by_user_id: 'u1', created_at: '2025-06-01T12:00:00Z',
        metadata: {},
        splits: [{ id: 's1', expense_id: 'e1', user_id: 'u1', amount_owed_cents: 3700, amount_paid_cents: 0, settled_at: null }],
      },
      error: null,
    }));
    const result = await new SupabaseExpenseRepository().getExpense('e1');
    if (result.ok) expect(result.value.splits).toHaveLength(1);
  });
});

// ── Error wrapping ────────────────────────────────────────────────────────────

describe('SupabaseTripRepository — error wrapping', () => {
  it('getTrip wraps PGRST116 as NotFoundError', async () => {
    supabase.from.mockReturnValue(
      mockChain({ data: null, error: { message: 'no rows', code: 'PGRST116' } }),
    );
    const result = await new SupabaseTripRepository().getTrip('missing-id');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('NotFoundError');
      if (result.error.kind === 'NotFoundError') {
        expect(result.error.resource).toBe('Trip');
      }
    }
  });

  it('getTrip wraps generic Supabase error as NetworkError', async () => {
    supabase.from.mockReturnValue(
      mockChain({ data: null, error: { message: 'connection refused', code: '500' } }),
    );
    const result = await new SupabaseTripRepository().getTrip('t1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NetworkError');
  });

  it('deleteTrip returns ok when no error', async () => {
    supabase.from.mockReturnValue(mockChain({ data: null, error: null }));
    const result = await new SupabaseTripRepository().deleteTrip('t1');
    expect(result.ok).toBe(true);
  });

  it('deleteTrip returns NetworkError on Supabase error', async () => {
    supabase.from.mockReturnValue(
      mockChain({ data: null, error: { message: 'RLS violation', code: '42501' } }),
    );
    const result = await new SupabaseTripRepository().deleteTrip('t1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NetworkError');
  });
});

describe('SupabaseSplitRepository — error wrapping', () => {
  it('getSplit wraps PGRST116 as NotFoundError with correct id', async () => {
    supabase.from.mockReturnValue(
      mockChain({ data: null, error: { message: 'no rows', code: 'PGRST116' } }),
    );
    const result = await new SupabaseSplitRepository().getSplit('s-missing');
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === 'NotFoundError') {
      expect(result.error.id).toBe('s-missing');
    }
  });
});
