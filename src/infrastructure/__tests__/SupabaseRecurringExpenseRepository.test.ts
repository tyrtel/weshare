jest.mock('../supabase/supabaseClient', () => ({
  supabase: { from: jest.fn() },
}));

import { SupabaseRecurringExpenseRepository } from '../supabase/SupabaseRecurringExpenseRepository';
import { mockChain } from '../../__testUtils__/supabaseMockChain';
import { recurringExpenseFactory, recurringExpenseSplitFactory } from '../../__testUtils__/factories';

const { supabase } = require('../supabase/supabaseClient') as { supabase: { from: jest.Mock } };

function splitRow(overrides: Record<string, unknown> = {}) {
  return {
    id:                    'res-1',
    recurring_expense_id:  're-1',
    user_id:               'jay',
    amount_owed_cents:     3000,
    ...overrides,
  };
}

function recurringExpenseRow(overrides: Record<string, unknown> = {}) {
  return {
    id:                 're-1',
    group_id:           'g1',
    description:        'Rent',
    total_amount_cents: 6000,
    currency:           'EUR',
    paid_by_user_id:    'jay',
    period:             'monthly',
    start_date:         '2026-01-01',
    next_due_at:        '2026-08-01',
    last_spawned_at:    null,
    paused_at:          null,
    created_at:         '2026-01-01T00:00:00.000Z',
    created_by_user_id: 'jay',
    recurring_expense_splits: [splitRow()],
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('SupabaseRecurringExpenseRepository — getRecurringExpensesForGroup', () => {
  it('maps rows including their embedded splits', async () => {
    supabase.from.mockReturnValue(mockChain({ data: [recurringExpenseRow()], error: null }));

    const result = await new SupabaseRecurringExpenseRepository().getRecurringExpensesForGroup('g1');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0].description).toBe('Rent');
      expect(result.value[0].splits).toHaveLength(1);
      expect(result.value[0].splits[0].amountOwedCents).toBe(3000);
      expect(result.value[0].startDate).toBeInstanceOf(Date);
      expect(result.value[0].lastSpawnedAt).toBeNull();
    }
  });

  it('defaults to an empty split list when recurring_expense_splits is absent', async () => {
    const row = recurringExpenseRow();
    delete (row as Record<string, unknown>).recurring_expense_splits;
    supabase.from.mockReturnValue(mockChain({ data: [row], error: null }));

    const result = await new SupabaseRecurringExpenseRepository().getRecurringExpensesForGroup('g1');

    if (result.ok) expect(result.value[0].splits).toEqual([]);
  });

  it('maps pausedAt to a Date when the rule is paused', async () => {
    supabase.from.mockReturnValue(mockChain({
      data: [recurringExpenseRow({ paused_at: '2026-06-01T00:00:00.000Z' })],
      error: null,
    }));

    const result = await new SupabaseRecurringExpenseRepository().getRecurringExpensesForGroup('g1');

    if (result.ok) expect(result.value[0].pausedAt).toBeInstanceOf(Date);
  });

  it('propagates a Supabase error without attempting to map rows', async () => {
    supabase.from.mockReturnValue(mockChain({ data: null, error: { message: 'timeout' } }));

    const result = await new SupabaseRecurringExpenseRepository().getRecurringExpensesForGroup('g1');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NetworkError');
  });

  it('stops at the first invalid row instead of returning a partial list', async () => {
    supabase.from.mockReturnValue(mockChain({
      data: [recurringExpenseRow(), recurringExpenseRow({ id: 're-2', period: 'yearly' })],
      error: null,
    }));

    const result = await new SupabaseRecurringExpenseRepository().getRecurringExpensesForGroup('g1');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('ValidationError');
  });
});

describe('SupabaseRecurringExpenseRepository — saveRecurringExpense', () => {
  it('inserts the rule only when there are no splits to insert', async () => {
    supabase.from.mockReturnValue(mockChain({ data: null, error: null }));

    const result = await new SupabaseRecurringExpenseRepository().saveRecurringExpense(
      recurringExpenseFactory({ splits: [] }),
    );

    expect(result.ok).toBe(true);
    expect(supabase.from).toHaveBeenCalledTimes(1);
    expect(supabase.from).toHaveBeenCalledWith('recurring_expenses');
  });

  it('inserts both the rule and its splits when splits are present', async () => {
    supabase.from
      .mockReturnValueOnce(mockChain({ data: null, error: null }))
      .mockReturnValueOnce(mockChain({ data: null, error: null }));

    const result = await new SupabaseRecurringExpenseRepository().saveRecurringExpense(
      recurringExpenseFactory({ splits: [recurringExpenseSplitFactory()] }),
    );

    expect(result.ok).toBe(true);
    expect(supabase.from).toHaveBeenNthCalledWith(1, 'recurring_expenses');
    expect(supabase.from).toHaveBeenNthCalledWith(2, 'recurring_expense_splits');
  });

  it('returns an error and never attempts the split insert when the rule insert fails', async () => {
    supabase.from.mockReturnValue(mockChain({ data: null, error: { message: 'duplicate id' } }));

    const result = await new SupabaseRecurringExpenseRepository().saveRecurringExpense(
      recurringExpenseFactory({ splits: [recurringExpenseSplitFactory()] }),
    );

    expect(result.ok).toBe(false);
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });

  it('returns an error when the split insert fails', async () => {
    supabase.from
      .mockReturnValueOnce(mockChain({ data: null, error: null }))
      .mockReturnValueOnce(mockChain({ data: null, error: { message: 'split insert failed' } }));

    const result = await new SupabaseRecurringExpenseRepository().saveRecurringExpense(
      recurringExpenseFactory({ splits: [recurringExpenseSplitFactory()] }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NetworkError');
  });
});

describe('SupabaseRecurringExpenseRepository — updateRecurringExpense', () => {
  it('updates the rule, replaces its splits, and returns ok', async () => {
    supabase.from
      .mockReturnValueOnce(mockChain({ data: null, error: null }))  // update recurring_expenses
      .mockReturnValueOnce(mockChain({ data: null, error: null }))  // delete old splits
      .mockReturnValueOnce(mockChain({ data: null, error: null })); // insert new splits

    const result = await new SupabaseRecurringExpenseRepository().updateRecurringExpense(
      recurringExpenseFactory({ splits: [recurringExpenseSplitFactory()] }),
    );

    expect(result.ok).toBe(true);
    expect(supabase.from).toHaveBeenNthCalledWith(1, 'recurring_expenses');
    expect(supabase.from).toHaveBeenNthCalledWith(2, 'recurring_expense_splits');
    expect(supabase.from).toHaveBeenNthCalledWith(3, 'recurring_expense_splits');
  });

  it('deletes old splits but skips the re-insert when the new split list is empty', async () => {
    supabase.from
      .mockReturnValueOnce(mockChain({ data: null, error: null }))
      .mockReturnValueOnce(mockChain({ data: null, error: null }));

    const result = await new SupabaseRecurringExpenseRepository().updateRecurringExpense(
      recurringExpenseFactory({ splits: [] }),
    );

    expect(result.ok).toBe(true);
    expect(supabase.from).toHaveBeenCalledTimes(2);
  });

  it('returns an error and stops before touching splits when the rule update fails', async () => {
    supabase.from.mockReturnValue(mockChain({ data: null, error: { message: 'update failed' } }));

    const result = await new SupabaseRecurringExpenseRepository().updateRecurringExpense(
      recurringExpenseFactory({ splits: [recurringExpenseSplitFactory()] }),
    );

    expect(result.ok).toBe(false);
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });

  it('returns an error and never re-inserts when deleting the old splits fails', async () => {
    supabase.from
      .mockReturnValueOnce(mockChain({ data: null, error: null }))
      .mockReturnValueOnce(mockChain({ data: null, error: { message: 'delete failed' } }));

    const result = await new SupabaseRecurringExpenseRepository().updateRecurringExpense(
      recurringExpenseFactory({ splits: [recurringExpenseSplitFactory()] }),
    );

    expect(result.ok).toBe(false);
    expect(supabase.from).toHaveBeenCalledTimes(2);
  });

  it('returns an error when the split re-insert fails', async () => {
    supabase.from
      .mockReturnValueOnce(mockChain({ data: null, error: null }))
      .mockReturnValueOnce(mockChain({ data: null, error: null }))
      .mockReturnValueOnce(mockChain({ data: null, error: { message: 'insert failed' } }));

    const result = await new SupabaseRecurringExpenseRepository().updateRecurringExpense(
      recurringExpenseFactory({ splits: [recurringExpenseSplitFactory()] }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NetworkError');
  });
});

describe('SupabaseRecurringExpenseRepository — deleteRecurringExpense', () => {
  it('returns ok on success', async () => {
    supabase.from.mockReturnValue(mockChain({ data: null, error: null }));
    const result = await new SupabaseRecurringExpenseRepository().deleteRecurringExpense('re-1');
    expect(result.ok).toBe(true);
  });

  it('returns a NetworkError on failure', async () => {
    supabase.from.mockReturnValue(mockChain({ data: null, error: { message: 'delete failed' } }));
    const result = await new SupabaseRecurringExpenseRepository().deleteRecurringExpense('re-1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NetworkError');
  });
});

describe('SupabaseRecurringExpenseRepository — pauseRecurringExpense / resumeRecurringExpense', () => {
  it('pauseRecurringExpense returns the mapped rule with pausedAt set', async () => {
    supabase.from.mockReturnValue(
      mockChain({ data: recurringExpenseRow({ paused_at: '2026-06-01T00:00:00.000Z' }), error: null }),
    );

    const result = await new SupabaseRecurringExpenseRepository().pauseRecurringExpense('re-1');

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.pausedAt).toBeInstanceOf(Date);
  });

  it('pauseRecurringExpense wraps a PGRST116 error as NotFoundError', async () => {
    supabase.from.mockReturnValue(
      mockChain({ data: null, error: { message: 'no rows', code: 'PGRST116' } }),
    );

    const result = await new SupabaseRecurringExpenseRepository().pauseRecurringExpense('missing');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NotFoundError');
  });

  it('resumeRecurringExpense returns the mapped rule with pausedAt cleared', async () => {
    supabase.from.mockReturnValue(
      mockChain({ data: recurringExpenseRow({ paused_at: null }), error: null }),
    );

    const result = await new SupabaseRecurringExpenseRepository().resumeRecurringExpense('re-1');

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.pausedAt).toBeNull();
  });

  it('resumeRecurringExpense returns a NetworkError on failure', async () => {
    supabase.from.mockReturnValue(mockChain({ data: null, error: { message: 'update failed' } }));

    const result = await new SupabaseRecurringExpenseRepository().resumeRecurringExpense('re-1');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NetworkError');
  });
});
