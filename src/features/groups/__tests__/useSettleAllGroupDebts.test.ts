import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { useSettleAllGroupDebts } from '../hooks/useSettleAllGroupDebts';
import { ServiceContext } from '../../../core/di/ServiceContext';
import { createTestContainer } from '../../../core/di/testContainer';
import { EXPENSE_REPO, TRIP_STORE } from '../../../core/di/tokens';
import { InMemoryExpenseRepository } from '../../../__mocks__/InMemoryExpenseRepository';
import { InMemoryTripRepository } from '../../../__mocks__/InMemoryTripRepository';
import { groupFactory, tripFactory, expenseFactory } from '../../../__testUtils__/factories';
import type { ServiceContainer } from '../../../core/di/ServiceContainer';

function makeWrapper(container: ServiceContainer) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(ServiceContext.Provider, { value: container }, children);
  };
}

const GROUP_ID = 'g1';

describe('useSettleAllGroupDebts', () => {
  let container: ServiceContainer;
  let expenseRepo: InMemoryExpenseRepository;
  let tripRepo: InMemoryTripRepository;

  const group       = groupFactory({ id: GROUP_ID, members: [] });
  const activeTrip  = tripFactory({ id: 't1', groupId: GROUP_ID, status: 'active' });
  const groupExp1   = expenseFactory({ id: 'e1', groupId: GROUP_ID, tripId: undefined, settledAt: null });
  const groupExp2   = expenseFactory({ id: 'e2', groupId: GROUP_ID, tripId: undefined, settledAt: null });
  const alreadySettled = expenseFactory({ id: 'e3', groupId: GROUP_ID, tripId: undefined, settledAt: new Date() });

  beforeEach(async () => {
    expenseRepo = new InMemoryExpenseRepository();
    expenseRepo.seed([groupExp1, groupExp2, alreadySettled]);
    tripRepo = new InMemoryTripRepository();
    tripRepo.seed([activeTrip]);
    container = createTestContainer({ expenseRepo, tripRepo });

    const store = container.resolve(TRIP_STORE).getState();
    store.appendGroup(group);
    store.appendTrip(activeTrip);
    await store.loadGroupDetail(GROUP_ID);
  });

  it('returns true when everything settles successfully', async () => {
    const { result } = renderHook(() => useSettleAllGroupDebts(GROUP_ID), { wrapper: makeWrapper(container) });

    let ok = false;
    await act(async () => { ok = await result.current.settleAll(); });

    expect(ok).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('marks all unsettled group expenses as settled in the repo', async () => {
    const { result } = renderHook(() => useSettleAllGroupDebts(GROUP_ID), { wrapper: makeWrapper(container) });

    await act(async () => { await result.current.settleAll(); });

    const e1 = await expenseRepo.getExpense('e1');
    const e2 = await expenseRepo.getExpense('e2');
    expect(e1.ok && e1.value.settledAt).not.toBeNull();
    expect(e2.ok && e2.value.settledAt).not.toBeNull();
  });

  it('reflects settled group expenses in the store', async () => {
    const { result } = renderHook(() => useSettleAllGroupDebts(GROUP_ID), { wrapper: makeWrapper(container) });

    await act(async () => { await result.current.settleAll(); });

    const storeExpenses = container.resolve(TRIP_STORE).getState().groupExpenses[GROUP_ID] ?? [];
    const e1 = storeExpenses.find(e => e.id === 'e1');
    const e2 = storeExpenses.find(e => e.id === 'e2');
    expect(e1?.settledAt).not.toBeNull();
    expect(e2?.settledAt).not.toBeNull();
  });

  it('skips expenses that are already settled', async () => {
    const { result } = renderHook(() => useSettleAllGroupDebts(GROUP_ID), { wrapper: makeWrapper(container) });

    // e3 is already settled — settledAt should not be changed.
    const originalSettledAt = alreadySettled.settledAt;
    await act(async () => { await result.current.settleAll(); });

    const e3 = await expenseRepo.getExpense('e3');
    expect(e3.ok && e3.value.settledAt?.getTime()).toBe(originalSettledAt?.getTime());
  });

  it('closes all active trips in the group', async () => {
    const { result } = renderHook(() => useSettleAllGroupDebts(GROUP_ID), { wrapper: makeWrapper(container) });

    await act(async () => { await result.current.settleAll(); });

    const store = container.resolve(TRIP_STORE).getState();
    const trip  = store.trips.find(t => t.id === 't1');
    expect(trip?.status).toBe('closed');
  });

  it('does not close trips belonging to other groups', async () => {
    const otherTrip = tripFactory({ id: 't2', groupId: 'other-group', status: 'active' });
    tripRepo.seed([otherTrip]);
    container.resolve(TRIP_STORE).getState().appendTrip(otherTrip);

    const { result } = renderHook(() => useSettleAllGroupDebts(GROUP_ID), { wrapper: makeWrapper(container) });

    await act(async () => { await result.current.settleAll(); });

    const store = container.resolve(TRIP_STORE).getState();
    const trip  = store.trips.find(t => t.id === 't2');
    expect(trip?.status).toBe('active');
  });
});
