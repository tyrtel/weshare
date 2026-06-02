import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { useEditExpense } from '../hooks/useEditExpense';
import { ServiceContext } from '../../../core/di/ServiceContext';
import { createTestContainer } from '../../../core/di/testContainer';
import { EXPENSE_REPO, SPLIT_REPO } from '../../../core/di/tokens';
import type { ServiceContainer } from '../../../core/di/ServiceContainer';
import type { Expense } from '../../../core/models/Expense';
import type { AddExpenseInput } from '../hooks/useAddExpense';
import { expenseFactory } from '../../../__testUtils__/factories';

function makeWrapper(container: ServiceContainer) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(ServiceContext.Provider, { value: container }, children);
  };
}

const NOW = new Date('2025-06-01T12:00:00Z');

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
      updated = await result.current.editExpense(expenseFactory(), makeInput());
    });

    expect(updated).not.toBeNull();
    expect(updated?.description).toBe('Updated Dinner');
    expect(updated?.totalAmountCents).toBe(12000);
  });

  it('replaces splits with the new ones', async () => {
    const { result } = renderHook(() => useEditExpense(), { wrapper: makeWrapper(container) });

    let updated: Expense | null = null;
    await act(async () => {
      updated = await result.current.editExpense(expenseFactory(), makeInput({
        splits: [{ userId: 'jay', amountOwedCents: 12000 }],
      }));
    });

    expect(updated?.splits).toHaveLength(1);
    expect(updated?.splits[0].userId).toBe('jay');
    expect(updated?.splits[0].amountOwedCents).toBe(12000);
  });

  it('old splits are removed from storage', async () => {
    const { result } = renderHook(() => useEditExpense(), { wrapper: makeWrapper(container) });
    const splitRepo = container.resolve(SPLIT_REPO);

    await act(async () => {
      await result.current.editExpense(expenseFactory(), makeInput({
        splits: [{ userId: 'jay', amountOwedCents: 12000 }],
      }));
    });

    const remaining = await splitRepo.getSplitsForExpense('e1');
    expect(remaining.ok).toBe(true);
    if (remaining.ok) {
      expect(remaining.value).toHaveLength(1);
      expect(remaining.value[0].userId).toBe('jay');
    }
  });

  it('loading is false before and after submission', async () => {
    const { result } = renderHook(() => useEditExpense(), { wrapper: makeWrapper(container) });
    expect(result.current.loading).toBe(false);

    await act(async () => {
      await result.current.editExpense(expenseFactory(), makeInput());
    });

    expect(result.current.loading).toBe(false);
  });
});

describe('useEditExpense — storage error', () => {
  it('returns null and sets error when expense does not exist in storage', async () => {
    const container = createTestContainer();
    const { result } = renderHook(() => useEditExpense(), { wrapper: makeWrapper(container) });

    // 'e1' was never saved — updateExpense returns NotFoundError.
    let updated: Expense | null = expenseFactory();
    await act(async () => {
      updated = await result.current.editExpense(expenseFactory(), makeInput());
    });

    expect(updated).toBeNull();
    expect(result.current.error).not.toBeNull();
  });
});
