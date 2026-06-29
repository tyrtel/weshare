import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { useCreateGroupExpense } from '../hooks/useCreateGroupExpense';
import { ServiceContext } from '../../../core/di/ServiceContext';
import { createTestContainer } from '../../../core/di/testContainer';
import { EXPENSE_REPO, SPLIT_REPO, TRIP_STORE } from '../../../core/di/tokens';
import { groupFactory, groupMemberFactory } from '../../../__testUtils__/factories';
import type { ServiceContainer } from '../../../core/di/ServiceContainer';
import type { Expense } from '../../../core/models/Expense';

function makeWrapper(container: ServiceContainer) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(ServiceContext.Provider, { value: container }, children);
  };
}

const GROUP_ID = 'g1';

const validInput = {
  description:      'Dinner',
  totalAmountCents: 3000,
  currency:         'EUR',
  paidByUserId:     'u1',
  splits:           [
    { userId: 'u1', amountOwedCents: 1500 },
    { userId: 'u2', amountOwedCents: 1500 },
  ],
};

describe('useCreateGroupExpense', () => {
  let container: ServiceContainer;

  beforeEach(() => {
    container = createTestContainer();
    const group = groupFactory({ id: GROUP_ID, members: [groupMemberFactory(), groupMemberFactory({ userId: 'u2', displayName: 'Sam' })] });
    container.resolve(TRIP_STORE).getState().appendGroup(group);
    container.resolve(TRIP_STORE).getState()._setGroupExpenses?.(GROUP_ID, []);
  });

  it('creates and returns an expense', async () => {
    const { result } = renderHook(() => useCreateGroupExpense(GROUP_ID), { wrapper: makeWrapper(container) });

    let expense: Expense | null = null;
    await act(async () => { expense = await result.current.createGroupExpense(validInput); });

    expect(expense).not.toBeNull();
    expect(expense?.description).toBe('Dinner');
    expect(expense?.groupId).toBe(GROUP_ID);
    expect(expense?.tripId).toBeUndefined();
    expect(expense?.settledAt).toBeNull();
  });

  it('saves splits alongside the expense', async () => {
    const splitRepo = container.resolve(SPLIT_REPO);
    const { result } = renderHook(() => useCreateGroupExpense(GROUP_ID), { wrapper: makeWrapper(container) });

    let expense: Expense | null = null;
    await act(async () => { expense = await result.current.createGroupExpense(validInput); });

    expect(expense?.splits).toHaveLength(2);
    const splits = await splitRepo.getSplitsForExpense(expense!.id);
    expect(splits.ok && splits.value).toHaveLength(2);
  });

  it('persists the expense to the repo', async () => {
    const expenseRepo = container.resolve(EXPENSE_REPO);
    const { result } = renderHook(() => useCreateGroupExpense(GROUP_ID), { wrapper: makeWrapper(container) });

    let expense: Expense | null = null;
    await act(async () => { expense = await result.current.createGroupExpense(validInput); });

    const fetched = await expenseRepo.getExpense(expense!.id);
    expect(fetched.ok).toBe(true);
  });

  it('appends the expense to the store', async () => {
    const { result } = renderHook(() => useCreateGroupExpense(GROUP_ID), { wrapper: makeWrapper(container) });

    let expense: Expense | null = null;
    await act(async () => { expense = await result.current.createGroupExpense(validInput); });

    const storeExpenses = container.resolve(TRIP_STORE).getState().groupExpenses[GROUP_ID] ?? [];
    expect(storeExpenses.some(e => e.id === expense!.id)).toBe(true);
  });

  it('returns null and ValidationError for empty description', async () => {
    const { result } = renderHook(() => useCreateGroupExpense(GROUP_ID), { wrapper: makeWrapper(container) });

    let expense: Expense | null = null;
    await act(async () => {
      expense = await result.current.createGroupExpense({ ...validInput, description: '  ' });
    });

    expect(expense).toBeNull();
    expect(result.current.error?.kind).toBe('ValidationError');
  });

  it('returns null and ValidationError when split total mismatches', async () => {
    const { result } = renderHook(() => useCreateGroupExpense(GROUP_ID), { wrapper: makeWrapper(container) });

    let expense: Expense | null = null;
    await act(async () => {
      expense = await result.current.createGroupExpense({
        ...validInput,
        splits: [{ userId: 'u1', amountOwedCents: 999 }],
      });
    });

    expect(expense).toBeNull();
    expect(result.current.error?.kind).toBe('ValidationError');
  });

  it('returns null and ValidationError for zero amount', async () => {
    const { result } = renderHook(() => useCreateGroupExpense(GROUP_ID), { wrapper: makeWrapper(container) });

    let expense: Expense | null = null;
    await act(async () => {
      expense = await result.current.createGroupExpense({ ...validInput, totalAmountCents: 0 });
    });

    expect(expense).toBeNull();
    expect(result.current.error?.kind).toBe('ValidationError');
  });

  it('loading is false initially', () => {
    const { result } = renderHook(() => useCreateGroupExpense(GROUP_ID), { wrapper: makeWrapper(container) });
    expect(result.current.loading).toBe(false);
  });
});
