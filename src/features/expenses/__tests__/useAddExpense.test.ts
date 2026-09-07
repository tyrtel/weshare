import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { useAddExpense, equalSplit } from '../hooks/useAddExpense';
import { ServiceContext } from '../../../core/di/ServiceContext';
import { createTestContainer } from '../../../core/di/testContainer';
import { EXPENSE_REPO } from '../../../core/di/tokens';
import { InMemoryExpenseRepository } from '../../../__mocks__/InMemoryExpenseRepository';
import { InMemorySplitRepository } from '../../../__mocks__/InMemorySplitRepository';
import type { ServiceContainer } from '../../../core/di/ServiceContainer';
import type { AddExpenseInput } from '../hooks/useAddExpense';

function makeWrapper(container: ServiceContainer) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(ServiceContext.Provider, { value: container }, children);
  };
}

// ── equalSplit pure helper ────────────────────────────────────────────────────

describe('equalSplit()', () => {
  it('4 people, €100 → 4 × €25', () => {
    const splits = equalSplit(10000, ['a', 'b', 'c', 'd']);
    expect(splits).toHaveLength(4);
    splits.forEach(s => expect(s.amountOwedCents).toBe(2500));
  });

  it('3 people, 10 cents → remainder on last (4, 3, 3)', () => {
    const splits = equalSplit(10, ['a', 'b', 'c']);
    const total = splits.reduce((s, e) => s + e.amountOwedCents, 0);
    expect(total).toBe(10);
    expect(splits[2].amountOwedCents).toBe(4); // last gets remainder
  });

  it('returns empty array for zero members', () => {
    expect(equalSplit(1000, [])).toEqual([]);
  });

  it('single person gets entire amount', () => {
    expect(equalSplit(5000, ['jay'])).toEqual([{ userId: 'jay', amountOwedCents: 5000 }]);
  });

  it('sum always equals totalCents', () => {
    for (const n of [2, 3, 5, 7]) {
      const splits = equalSplit(10001, Array.from({ length: n }, (_, i) => `u${i}`));
      const sum    = splits.reduce((s, e) => s + e.amountOwedCents, 0);
      expect(sum).toBe(10001);
    }
  });
});

// ── useAddExpense hook ────────────────────────────────────────────────────────

const TRIP_ID  = 't1';
const CURRENCY = 'EUR';

/** Minimal valid input for a 4-way equal €100 split, Jay pays. */
function makeInput(overrides: Partial<AddExpenseInput> = {}): AddExpenseInput {
  return {
    description: 'Chez Paul dinner',
    totalAmountCents: 10000,
    currency: CURRENCY,
    paidByUserId: 'jay',
    splits: [
      { userId: 'jay',   amountOwedCents: 2500 },
      { userId: 'marie', amountOwedCents: 2500 },
      { userId: 'tom',   amountOwedCents: 2500 },
      { userId: 'sara',  amountOwedCents: 2500 },
    ],
    ...overrides,
  };
}

describe('useAddExpense — equal split', () => {
  let container: ServiceContainer;

  beforeEach(() => {
    container = createTestContainer();
  });

  it('creates an expense and returns it', async () => {
    const { result } = renderHook(() => useAddExpense(TRIP_ID), { wrapper: makeWrapper(container) });

    let expense: import('../../../core/models/Expense').Expense | null = null;
    await act(async () => { expense = await result.current.addExpense(makeInput()); });

    expect(expense).not.toBeNull();
    expect(expense?.description).toBe('Chez Paul dinner');
    expect(expense?.totalAmountCents).toBe(10000);
  });

  it('attaches 4 splits to the saved expense', async () => {
    const { result } = renderHook(() => useAddExpense(TRIP_ID), { wrapper: makeWrapper(container) });

    let expense: import('../../../core/models/Expense').Expense | null = null;
    await act(async () => { expense = await result.current.addExpense(makeInput()); });

    expect(expense?.splits).toHaveLength(4);
    expect(expense?.splits.every(s => s.amountOwedCents === 2500)).toBe(true);
  });

  it('persists the expense to storage', async () => {
    const { result } = renderHook(() => useAddExpense(TRIP_ID), { wrapper: makeWrapper(container) });
    const expenseRepo = container.resolve(EXPENSE_REPO);

    let expense: import('../../../core/models/Expense').Expense | null = null;
    await act(async () => { expense = await result.current.addExpense(makeInput()); });

    const fetched = await expenseRepo.getExpense(expense!.id);
    expect(fetched.ok).toBe(true);
  });

  it('loading is false before and after submission', async () => {
    const { result } = renderHook(() => useAddExpense(TRIP_ID), { wrapper: makeWrapper(container) });
    expect(result.current.loading).toBe(false);
    await act(async () => { await result.current.addExpense(makeInput()); });
    expect(result.current.loading).toBe(false);
  });
});

describe('useAddExpense — partial exclusion', () => {
  it('Tom excluded: only 3 splits created', async () => {
    const container = createTestContainer();
    const { result } = renderHook(() => useAddExpense(TRIP_ID), { wrapper: makeWrapper(container) });

    const input = makeInput({
      totalAmountCents: 6000,
      splits: [
        { userId: 'jay',   amountOwedCents: 2000 },
        { userId: 'marie', amountOwedCents: 2000 },
        { userId: 'sara',  amountOwedCents: 2000 },
        // Tom excluded
      ],
    });

    let expense: import('../../../core/models/Expense').Expense | null = null;
    await act(async () => { expense = await result.current.addExpense(input); });

    expect(expense?.splits).toHaveLength(3);
    expect(expense?.splits.some(s => s.userId === 'tom')).toBe(false);
  });
});

describe('useAddExpense — custom amounts', () => {
  it('accepts unequal splits that sum to total', async () => {
    const container = createTestContainer();
    const { result } = renderHook(() => useAddExpense(TRIP_ID), { wrapper: makeWrapper(container) });

    const input = makeInput({
      totalAmountCents: 10000,
      splits: [
        { userId: 'jay',   amountOwedCents: 5000 },
        { userId: 'marie', amountOwedCents: 3000 },
        { userId: 'tom',   amountOwedCents: 2000 },
      ],
    });

    let expense: import('../../../core/models/Expense').Expense | null = null;
    await act(async () => { expense = await result.current.addExpense(input); });

    expect(expense).not.toBeNull();
    const jay = expense?.splits.find(s => s.userId === 'jay');
    expect(jay?.amountOwedCents).toBe(5000);
  });
});

describe('useAddExpense — validation errors', () => {
  let container: ServiceContainer;
  beforeEach(() => { container = createTestContainer(); });

  it('returns null and sets ValidationError for empty description', async () => {
    const { result } = renderHook(() => useAddExpense(TRIP_ID), { wrapper: makeWrapper(container) });

    let expense: unknown = 'not-null';
    await act(async () => { expense = await result.current.addExpense(makeInput({ description: '  ' })); });

    expect(expense).toBeNull();
    expect(result.current.error?.kind).toBe('ValidationError');
    if (result.current.error?.kind === 'ValidationError') {
      expect(result.current.error.field).toBe('description');
    }
  });

  it('returns null and sets ValidationError for zero amount', async () => {
    const { result } = renderHook(() => useAddExpense(TRIP_ID), { wrapper: makeWrapper(container) });

    let expense: unknown = 'not-null';
    await act(async () => {
      expense = await result.current.addExpense(makeInput({ totalAmountCents: 0 }));
    });

    expect(expense).toBeNull();
    expect(result.current.error?.kind).toBe('ValidationError');
    if (result.current.error?.kind === 'ValidationError') {
      expect(result.current.error.field).toBe('totalAmount');
    }
  });

  it('returns null and sets ValidationError for missing payer', async () => {
    const { result } = renderHook(() => useAddExpense(TRIP_ID), { wrapper: makeWrapper(container) });

    let expense: unknown = 'not-null';
    await act(async () => {
      expense = await result.current.addExpense(makeInput({ paidByUserId: '' }));
    });

    expect(expense).toBeNull();
    expect(result.current.error?.kind).toBe('ValidationError');
    if (result.current.error?.kind === 'ValidationError') {
      expect(result.current.error.field).toBe('paidByUserId');
    }
  });

  it('returns null and sets ValidationError for empty splits array', async () => {
    const { result } = renderHook(() => useAddExpense(TRIP_ID), { wrapper: makeWrapper(container) });

    let expense: unknown = 'not-null';
    await act(async () => {
      expense = await result.current.addExpense(makeInput({ splits: [] }));
    });

    expect(expense).toBeNull();
    expect(result.current.error?.kind).toBe('ValidationError');
    if (result.current.error?.kind === 'ValidationError') {
      expect(result.current.error.field).toBe('splits');
    }
  });

  it('returns null and sets ValidationError when splits do not sum to total', async () => {
    const { result } = renderHook(() => useAddExpense(TRIP_ID), { wrapper: makeWrapper(container) });

    const badInput = makeInput({
      totalAmountCents: 10000,
      splits: [
        { userId: 'jay',   amountOwedCents: 2500 },
        { userId: 'marie', amountOwedCents: 2500 },
        // Only 5000 of 10000 assigned
      ],
    });

    let expense: unknown = 'not-null';
    await act(async () => { expense = await result.current.addExpense(badInput); });

    expect(expense).toBeNull();
    expect(result.current.error?.kind).toBe('ValidationError');
    if (result.current.error?.kind === 'ValidationError') {
      expect(result.current.error.field).toBe('splits');
    }
  });

  it('rejects non-integer totalAmountCents', async () => {
    const { result } = renderHook(() => useAddExpense(TRIP_ID), { wrapper: makeWrapper(container) });

    let expense: unknown = 'not-null';
    await act(async () => {
      expense = await result.current.addExpense(makeInput({ totalAmountCents: 99.9 }));
    });

    expect(expense).toBeNull();
    expect(result.current.error?.kind).toBe('ValidationError');
  });
});

// ── Exception safety ──────────────────────────────────────────────────────────
// Regression coverage for a reported bug: on device, tapping "Save expense"
// would seemingly save but never navigate away, letting a second tap create a
// duplicate. Root cause — addExpense had no try/catch, so a thrown exception
// (a real network failure, distinct from a repo returning Result.err) left
// `loading` stuck at true forever and skipped the screen's post-save
// navigation entirely, with no error surfaced to explain why.

describe('useAddExpense — exception safety', () => {
  it('resets loading and sets a NetworkError when saveExpense throws, instead of hanging forever', async () => {
    const expenseRepo = new InMemoryExpenseRepository();
    expenseRepo.saveExpense = async () => { throw new Error('fetch failed'); };
    const container = createTestContainer({ expenseRepo });

    const { result } = renderHook(() => useAddExpense(TRIP_ID), { wrapper: makeWrapper(container) });

    let expense: unknown = 'not-null';
    await act(async () => { expense = await result.current.addExpense(makeInput()); });

    expect(expense).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error?.kind).toBe('NetworkError');
  });

  it('resets loading and sets a NetworkError when a split save throws after the expense already saved', async () => {
    const splitRepo = new InMemorySplitRepository();
    splitRepo.saveSplit = async () => { throw new Error('connection reset'); };
    const container = createTestContainer({ splitRepo });

    const { result } = renderHook(() => useAddExpense(TRIP_ID), { wrapper: makeWrapper(container) });

    let expense: unknown = 'not-null';
    await act(async () => { expense = await result.current.addExpense(makeInput()); });

    expect(expense).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error?.kind).toBe('NetworkError');
  });
});
