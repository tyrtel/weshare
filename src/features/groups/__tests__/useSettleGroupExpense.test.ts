import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { useSettleGroupExpense } from '../hooks/useSettleGroupExpense';
import { ServiceContext } from '../../../core/di/ServiceContext';
import { createTestContainer } from '../../../core/di/testContainer';
import { EXPENSE_REPO, TRIP_STORE } from '../../../core/di/tokens';
import { InMemoryExpenseRepository } from '../../../__mocks__/InMemoryExpenseRepository';
import { expenseFactory } from '../../../__testUtils__/factories';
import type { ServiceContainer } from '../../../core/di/ServiceContainer';

function makeWrapper(container: ServiceContainer) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(ServiceContext.Provider, { value: container }, children);
  };
}

const GROUP_ID = 'g1';
const expense  = expenseFactory({ id: 'e1', groupId: GROUP_ID, tripId: undefined, settledAt: null });

describe('useSettleGroupExpense', () => {
  let container: ServiceContainer;
  let expenseRepo: InMemoryExpenseRepository;

  beforeEach(async () => {
    expenseRepo = new InMemoryExpenseRepository();
    expenseRepo.seed([expense]);
    container = createTestContainer({ expenseRepo });
    const store = container.resolve(TRIP_STORE).getState();
    await store.loadGroupDetail(GROUP_ID);
  });

  it('returns true on success', async () => {
    const { result } = renderHook(() => useSettleGroupExpense(), { wrapper: makeWrapper(container) });

    let ok = false;
    await act(async () => { ok = await result.current.settleGroupExpense('e1', GROUP_ID); });

    expect(ok).toBe(true);
  });

  it('updates the expense settledAt in the repo', async () => {
    const { result } = renderHook(() => useSettleGroupExpense(), { wrapper: makeWrapper(container) });

    await act(async () => { await result.current.settleGroupExpense('e1', GROUP_ID); });

    const fetched = await expenseRepo.getExpense('e1');
    expect(fetched.ok && fetched.value.settledAt).not.toBeNull();
  });

  it('updates the expense in the store', async () => {
    const { result } = renderHook(() => useSettleGroupExpense(), { wrapper: makeWrapper(container) });

    await act(async () => { await result.current.settleGroupExpense('e1', GROUP_ID); });

    const storeExpenses = container.resolve(TRIP_STORE).getState().groupExpenses[GROUP_ID] ?? [];
    const found = storeExpenses.find(e => e.id === 'e1');
    expect(found?.settledAt).not.toBeNull();
  });

  it('returns false for an unknown expense id', async () => {
    const { result } = renderHook(() => useSettleGroupExpense(), { wrapper: makeWrapper(container) });

    let ok = true;
    await act(async () => { ok = await result.current.settleGroupExpense('nonexistent', GROUP_ID); });

    expect(ok).toBe(false);
  });

  it('loading is false initially', () => {
    const { result } = renderHook(() => useSettleGroupExpense(), { wrapper: makeWrapper(container) });
    expect(result.current.loading).toBe(false);
  });
});
