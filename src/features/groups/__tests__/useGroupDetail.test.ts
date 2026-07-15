import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { useGroupDetail } from '../hooks/useGroupDetail';
import { ServiceContext } from '../../../core/di/ServiceContext';
import { createTestContainer } from '../../../core/di/testContainer';
import { EXPENSE_REPO, TRIP_STORE } from '../../../core/di/tokens';
import { InMemoryExpenseRepository } from '../../../__mocks__/InMemoryExpenseRepository';
import { groupFactory, groupMemberFactory, tripFactory, expenseFactory } from '../../../__testUtils__/factories';
import type { ServiceContainer } from '../../../core/di/ServiceContainer';

function makeWrapper(container: ServiceContainer) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(ServiceContext.Provider, { value: container }, children);
  };
}

describe('useGroupDetail', () => {
  let container: ServiceContainer;
  let expenseRepo: InMemoryExpenseRepository;

  const group = groupFactory({ id: 'g1', members: [groupMemberFactory()] });
  const trip1 = tripFactory({ id: 't1', groupId: 'g1', status: 'open' });
  const trip2 = tripFactory({ id: 't2', groupId: 'g1', status: 'closed' });
  const trip3 = tripFactory({ id: 't3', groupId: undefined, status: 'open' });
  const exp1  = expenseFactory({ id: 'e1', groupId: 'g1', tripId: undefined, settledAt: null });
  const exp2  = expenseFactory({ id: 'e2', groupId: 'g1', tripId: undefined, settledAt: new Date() });

  beforeEach(async () => {
    expenseRepo = new InMemoryExpenseRepository();
    expenseRepo.seed([exp1, exp2]);
    container = createTestContainer({ expenseRepo });

    const store = container.resolve(TRIP_STORE).getState();
    store.appendGroup(group);
    store.appendTrip(trip1);
    store.appendTrip(trip2);
    store.appendTrip(trip3);
    await store.loadGroupDetail('g1');
  });

  it('returns the group', () => {
    const { result } = renderHook(() => useGroupDetail('g1'), { wrapper: makeWrapper(container) });
    expect(result.current.group?.id).toBe('g1');
  });

  it('splits active and closed trips', () => {
    const { result } = renderHook(() => useGroupDetail('g1'), { wrapper: makeWrapper(container) });
    expect(result.current.activeTrips.map(t => t.id)).toEqual(['t1']);
    expect(result.current.closedTrips.map(t => t.id)).toEqual(['t2']);
  });

  it('excludes trips that belong to a different group', () => {
    const { result } = renderHook(() => useGroupDetail('g1'), { wrapper: makeWrapper(container) });
    const ids = [...result.current.activeTrips, ...result.current.closedTrips].map(t => t.id);
    expect(ids).not.toContain('t3');
  });

  // Phase 4c: settling an expense is retired — group expenses are no longer
  // split into active/settled buckets, both show up together.
  it('returns all group expenses regardless of legacy settledAt', () => {
    const { result } = renderHook(() => useGroupDetail('g1'), { wrapper: makeWrapper(container) });
    expect(result.current.groupExpenses.map(e => e.id).sort()).toEqual(['e1', 'e2']);
  });

  it('returns undefined group for unknown id', () => {
    const { result } = renderHook(() => useGroupDetail('unknown'), { wrapper: makeWrapper(container) });
    expect(result.current.group).toBeUndefined();
  });
});
