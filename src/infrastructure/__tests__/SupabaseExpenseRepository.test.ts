jest.mock('../supabase/supabaseClient', () => ({
  supabase: { from: jest.fn() },
}));

import { SupabaseExpenseRepository } from '../supabase/SupabaseExpenseRepository';
import { mockChain } from '../../__testUtils__/supabaseMockChain';
import type { Expense } from '../../core/models/Expense';

const { supabase } = require('../supabase/supabaseClient') as { supabase: { from: jest.Mock } };

function splitRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 's1', expense_id: 'e1', user_id: 'u1',
    amount_owed_cents: 1000, amount_paid_cents: 0, settled_at: null,
    ...overrides,
  };
}

function expenseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'e1',
    trip_id: 't1',
    group_id: null,
    description: 'Dinner',
    total_amount_cents: 2000,
    currency: 'EUR',
    paid_by_user_id: 'u1',
    created_at: '2026-01-01T00:00:00.000Z',
    settled_at: null,
    metadata: {},
    splits: [splitRow()],
    ...overrides,
  };
}

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'e1',
    tripId: 't1',
    description: 'Dinner',
    totalAmountCents: 2000,
    currency: 'EUR',
    paidByUserId: 'u1',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    settledAt: null,
    metadata: {},
    splits: [],
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('SupabaseExpenseRepository — getExpense', () => {
  it('maps the row and its nested splits', async () => {
    supabase.from.mockReturnValue(mockChain({ data: expenseRow(), error: null }));

    const result = await new SupabaseExpenseRepository().getExpense('e1');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.description).toBe('Dinner');
      expect(result.value.splits).toHaveLength(1);
      expect(result.value.splits[0].userId).toBe('u1');
    }
  });

  it('defaults tripId/groupId to undefined when the row has neither set', async () => {
    supabase.from.mockReturnValue(mockChain({ data: expenseRow({ trip_id: null, group_id: null }), error: null }));

    const result = await new SupabaseExpenseRepository().getExpense('e1');

    if (result.ok) {
      expect(result.value.tripId).toBeUndefined();
      expect(result.value.groupId).toBeUndefined();
    }
  });

  it('maps a group expense (group_id set, trip_id null)', async () => {
    supabase.from.mockReturnValue(mockChain({ data: expenseRow({ trip_id: null, group_id: 'g1' }), error: null }));

    const result = await new SupabaseExpenseRepository().getExpense('e1');

    if (result.ok) expect(result.value.groupId).toBe('g1');
  });

  it('returns a NotFoundError for a PGRST116 (no row) response', async () => {
    supabase.from.mockReturnValue(mockChain({ data: null, error: { message: 'no rows', code: 'PGRST116' } }));

    const result = await new SupabaseExpenseRepository().getExpense('missing');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NotFoundError');
  });

  it('propagates a schema-validation failure as an error rather than throwing', async () => {
    supabase.from.mockReturnValue(mockChain({ data: expenseRow({ description: '' }), error: null }));

    const result = await new SupabaseExpenseRepository().getExpense('e1');

    expect(result.ok).toBe(false);
  });
});

describe('SupabaseExpenseRepository — getExpensesForTrip', () => {
  it('maps every expense row for the trip in order', async () => {
    supabase.from.mockReturnValue(mockChain({
      data: [expenseRow(), expenseRow({ id: 'e2', description: 'Lunch', splits: [] })],
      error: null,
    }));

    const result = await new SupabaseExpenseRepository().getExpensesForTrip('t1');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(2);
      expect(result.value[1].description).toBe('Lunch');
    }
  });

  it('returns an empty list when the trip has no expenses', async () => {
    supabase.from.mockReturnValue(mockChain({ data: [], error: null }));

    const result = await new SupabaseExpenseRepository().getExpensesForTrip('t1');

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('stops and returns the first row-level error rather than the rest of the list', async () => {
    supabase.from.mockReturnValue(mockChain({
      data: [expenseRow({ id: 'e1' }), expenseRow({ id: 'e2', description: '' })],
      error: null,
    }));

    const result = await new SupabaseExpenseRepository().getExpensesForTrip('t1');

    expect(result.ok).toBe(false);
  });

  it('returns a NetworkError when the query fails', async () => {
    supabase.from.mockReturnValue(mockChain({ data: null, error: { message: 'timeout' } }));

    const result = await new SupabaseExpenseRepository().getExpensesForTrip('t1');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NetworkError');
  });
});

describe('SupabaseExpenseRepository — getExpensesForGroup', () => {
  it('maps every expense row for the group', async () => {
    supabase.from.mockReturnValue(mockChain({ data: [expenseRow({ trip_id: null, group_id: 'g1' })], error: null }));

    const result = await new SupabaseExpenseRepository().getExpensesForGroup('g1');

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value[0].groupId).toBe('g1');
  });

  it('returns a NetworkError when the query fails', async () => {
    supabase.from.mockReturnValue(mockChain({ data: null, error: { message: 'timeout' } }));

    const result = await new SupabaseExpenseRepository().getExpensesForGroup('g1');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NetworkError');
  });
});

describe('SupabaseExpenseRepository — saveExpense', () => {
  it('inserts the expense and returns the row Supabase echoes back', async () => {
    supabase.from.mockReturnValue(mockChain({ data: expenseRow(), error: null }));

    const result = await new SupabaseExpenseRepository().saveExpense(expense());

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.id).toBe('e1');
    expect(supabase.from).toHaveBeenCalledWith('expenses');
  });

  it('returns a NetworkError when the insert fails', async () => {
    supabase.from.mockReturnValue(mockChain({ data: null, error: { message: 'constraint violation' } }));

    const result = await new SupabaseExpenseRepository().saveExpense(expense());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NetworkError');
  });
});

describe('SupabaseExpenseRepository — updateExpense', () => {
  it('updates the expense and returns the mapped result', async () => {
    supabase.from.mockReturnValue(mockChain({ data: expenseRow({ description: 'Updated dinner' }), error: null }));

    const result = await new SupabaseExpenseRepository().updateExpense(expense({ description: 'Updated dinner' }));

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.description).toBe('Updated dinner');
  });

  it('returns a NotFoundError when the expense no longer exists', async () => {
    supabase.from.mockReturnValue(mockChain({ data: null, error: { message: 'no rows', code: 'PGRST116' } }));

    const result = await new SupabaseExpenseRepository().updateExpense(expense());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NotFoundError');
  });
});

describe('SupabaseExpenseRepository — deleteExpense', () => {
  it('deletes the expense', async () => {
    supabase.from.mockReturnValue(mockChain({ data: null, error: null }));

    const result = await new SupabaseExpenseRepository().deleteExpense('e1');

    expect(result).toEqual({ ok: true, value: undefined });
  });

  it('returns a NetworkError when the delete fails', async () => {
    supabase.from.mockReturnValue(mockChain({ data: null, error: { message: 'permission denied' } }));

    const result = await new SupabaseExpenseRepository().deleteExpense('e1');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NetworkError');
  });
});

describe('SupabaseExpenseRepository — settleExpense', () => {
  it('sets settled_at to the given date and returns the mapped result', async () => {
    supabase.from.mockReturnValue(mockChain({ data: expenseRow({ settled_at: '2026-02-01T00:00:00.000Z' }), error: null }));

    const result = await new SupabaseExpenseRepository().settleExpense('e1', new Date('2026-02-01T00:00:00.000Z'));

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.settledAt).toEqual(new Date('2026-02-01T00:00:00.000Z'));
  });

  it('clears settled_at when passed null (un-settling)', async () => {
    supabase.from.mockReturnValue(mockChain({ data: expenseRow({ settled_at: null }), error: null }));

    const result = await new SupabaseExpenseRepository().settleExpense('e1', null);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.settledAt).toBeNull();
  });

  it('returns a NetworkError when the update fails', async () => {
    supabase.from.mockReturnValue(mockChain({ data: null, error: { message: 'timeout' } }));

    const result = await new SupabaseExpenseRepository().settleExpense('e1', new Date());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NetworkError');
  });
});
