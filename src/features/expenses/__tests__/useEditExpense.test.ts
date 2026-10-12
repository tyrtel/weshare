import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useEditExpense } from '../hooks/useEditExpense';
import { ServiceContext } from '../../../core/di/ServiceContext';
import { createTestContainer } from '../../../core/di/testContainer';
import { EXPENSE_REPO, SPLIT_REPO, ACTIVITY_LOG, TRIP_STORE } from '../../../core/di/tokens';
import type { ServiceContainer } from '../../../core/di/ServiceContainer';
import type { Expense } from '../../../core/models/Expense';
import type { AddExpenseInput } from '../hooks/useAddExpense';
import { expenseFactory } from '../../../__testUtils__/factories';
import { InMemoryExpenseRepository } from '../../../__mocks__/InMemoryExpenseRepository';
import { InMemorySplitRepository } from '../../../__mocks__/InMemorySplitRepository';

function makeWrapper(container: ServiceContainer) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(ServiceContext.Provider, { value: container }, children);
  };
}


function makeInput(overrides: Partial<AddExpenseInput> = {}): AddExpenseInput {
  return {
    description: 'Updated Dinner',
    totalAmountCents: 12000,
    currency: 'EUR',
    paidByUserId: 'jay',
    splits: [
      { userId: 'jay',   amountOwedCents: 6000 },
      { userId: 'marie', amountOwedCents: 6000 },
    ],
    ...overrides,
  };
}

describe('useEditExpense — validation', () => {
  it('returns null and sets ValidationError for empty description', async () => {
    const container = createTestContainer();
    const { result } = renderHook(() => useEditExpense(), { wrapper: makeWrapper(container) });

    let expense: Expense | null = expenseFactory();
    await act(async () => {
      expense = await result.current.editExpense(expenseFactory(), makeInput({ description: '  ' }));
    });

    expect(expense).toBeNull();
    expect(result.current.error?.kind).toBe('ValidationError');
    if (result.current.error?.kind === 'ValidationError') {
      expect(result.current.error.field).toBe('description');
    }
  });

  it('returns null and sets ValidationError for zero amount', async () => {
    const container = createTestContainer();
    const { result } = renderHook(() => useEditExpense(), { wrapper: makeWrapper(container) });

    let expense: Expense | null = expenseFactory();
    await act(async () => {
      expense = await result.current.editExpense(expenseFactory(), makeInput({ totalAmountCents: 0 }));
    });

    expect(expense).toBeNull();
    expect(result.current.error?.kind).toBe('ValidationError');
    if (result.current.error?.kind === 'ValidationError') {
      expect(result.current.error.field).toBe('totalAmount');
    }
  });

  it('returns null and sets ValidationError for non-integer amount', async () => {
    const container = createTestContainer();
    const { result } = renderHook(() => useEditExpense(), { wrapper: makeWrapper(container) });

    let expense: Expense | null = expenseFactory();
    await act(async () => {
      expense = await result.current.editExpense(expenseFactory(), makeInput({ totalAmountCents: 99.9 }));
    });

    expect(expense).toBeNull();
    expect(result.current.error?.kind).toBe('ValidationError');
  });
});

describe('useEditExpense — success', () => {
  let container: ServiceContainer;

  beforeEach(async () => {
    container = createTestContainer();
    const expenseRepo = container.resolve(EXPENSE_REPO);
    const splitRepo   = container.resolve(SPLIT_REPO);
    await expenseRepo.saveExpense(expenseFactory());
    await splitRepo.saveSplit({ id: 's1', expenseId: 'e1', userId: 'jay', amountOwedCents: 5000, amountPaidCents: 0 });
    await splitRepo.saveSplit({ id: 's2', expenseId: 'e1', userId: 'marie', amountOwedCents: 5000, amountPaidCents: 0 });
  });

  it('returns the updated expense with new description and amount', async () => {
    const { result } = renderHook(() => useEditExpense(), { wrapper: makeWrapper(container) });

    let updated: Expense | null = null;
    await act(async () => {
      updated = result.current.editExpense(expenseFactory(), makeInput());
    });

    expect(updated).not.toBeNull();
    expect(updated?.description).toBe('Updated Dinner');
    expect(updated?.totalAmountCents).toBe(12000);
  });

  it('reflects the new paidByUserId in the returned expense', async () => {
    const { result } = renderHook(() => useEditExpense(), { wrapper: makeWrapper(container) });

    let updated: Expense | null = null;
    await act(async () => {
      updated = result.current.editExpense(
        expenseFactory({ paidByUserId: 'jay' }),
        makeInput({ paidByUserId: 'marie' }),
      );
    });

    expect(updated?.paidByUserId).toBe('marie');
  });

  it('replaces splits with the new ones', async () => {
    const { result } = renderHook(() => useEditExpense(), { wrapper: makeWrapper(container) });

    let updated: Expense | null = null;
    await act(async () => {
      updated = result.current.editExpense(expenseFactory(), makeInput({
        splits: [{ userId: 'jay', amountOwedCents: 12000 }],
      }));
    });

    expect(updated?.splits).toHaveLength(1);
    expect(updated?.splits[0].userId).toBe('jay');
    expect(updated?.splits[0].amountOwedCents).toBe(12000);
  });

  it('old splits are removed from storage once the background save lands', async () => {
    const { result } = renderHook(() => useEditExpense(), { wrapper: makeWrapper(container) });
    const splitRepo = container.resolve(SPLIT_REPO);

    act(() => {
      result.current.editExpense(expenseFactory(), makeInput({
        splits: [{ userId: 'jay', amountOwedCents: 12000 }],
      }));
    });

    await waitFor(async () => {
      const remaining = await splitRepo.getSplitsForExpense('e1');
      expect(remaining.ok && remaining.value.map(sp => sp.userId)).toEqual(['jay']);
    });
  });

  it('updates the cache before the server answers', () => {
    container.resolve(TRIP_STORE).setState({ expenses: { t1: [expenseFactory()] } });
    const { result } = renderHook(() => useEditExpense(), { wrapper: makeWrapper(container) });

    act(() => { result.current.editExpense(expenseFactory(), makeInput()); });

    expect(container.resolve(TRIP_STORE).getState().expenses['t1'][0].description).toBe('Updated Dinner');
  });

  it('appends an expense.updated activity event scoped to the trip', async () => {
    const { result } = renderHook(() => useEditExpense(), { wrapper: makeWrapper(container) });
    const activityLog = container.resolve(ACTIVITY_LOG);

    act(() => { result.current.editExpense(expenseFactory(), makeInput()); });

    await waitFor(async () => {
      const page = await activityLog.getEventsForTrip('t1');
      expect(page.ok && page.value.events.map(e => e.eventType)).toEqual(['expense.updated']);
    });
  });
});

describe('useEditExpense — storage error', () => {
  it('sets writeError, not the form error, when the server refuses the edit', async () => {
    // 'e1' was never saved — updateExpense returns NotFoundError.
    const container = createTestContainer();
    const store = container.resolve(TRIP_STORE);
    store.setState({ expenses: { t1: [expenseFactory()] } });
    const { result } = renderHook(() => useEditExpense(), { wrapper: makeWrapper(container) });

    act(() => { result.current.editExpense(expenseFactory(), makeInput()); });

    await waitFor(() => expect(store.getState().writeError).toMatchObject({ kind: 'NotFoundError' }));
    expect(result.current.error).toBeNull();
  });

  it('sets a NetworkError writeError when updateExpense throws', async () => {
    const expenseRepo = new InMemoryExpenseRepository();
    await expenseRepo.saveExpense(expenseFactory());
    expenseRepo.updateExpense = async () => { throw new Error('fetch failed'); };
    const container = createTestContainer({ expenseRepo });
    const store = container.resolve(TRIP_STORE);
    const { result } = renderHook(() => useEditExpense(), { wrapper: makeWrapper(container) });

    act(() => { result.current.editExpense(expenseFactory(), makeInput()); });

    await waitFor(() => expect(store.getState().writeError).toEqual({ kind: 'NetworkError', message: 'fetch failed' }));
  });

  it('sets writeError when saving a new split fails part-way', async () => {
    const splitRepo = new InMemorySplitRepository();
    splitRepo.saveSplit = async () => { throw new Error('split save failed'); };
    const expenseRepo = new InMemoryExpenseRepository();
    await expenseRepo.saveExpense(expenseFactory());
    const container = createTestContainer({ expenseRepo, splitRepo });
    const store = container.resolve(TRIP_STORE);
    const { result } = renderHook(() => useEditExpense(), { wrapper: makeWrapper(container) });

    act(() => { result.current.editExpense(expenseFactory(), makeInput()); });

    await waitFor(() => expect(store.getState().writeError).toEqual({ kind: 'NetworkError', message: 'split save failed' }));
  });
});
