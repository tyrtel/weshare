import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useGroupDetail } from '../hooks/useGroupDetail';
import { ServiceContext } from '../../../core/di/ServiceContext';
import { createTestContainer } from '../../../core/di/testContainer';
import { SPLIT_REQUEST_REPO, TRIP_STORE, TRIP_REPO } from '../../../core/di/tokens';
import { InMemoryExpenseRepository } from '../../../__mocks__/InMemoryExpenseRepository';
import { groupFactory, groupMemberFactory, tripFactory, expenseFactory, splitFactory } from '../../../__testUtils__/factories';
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

// ── recordPayment (Phase 4d) ──────────────────────────────────────────────────
// Group's counterpart to useSettlement's recordPayment — same ledger write
// primitive, group-scoped instead of trip-scoped.

describe('useGroupDetail — recordPayment', () => {
  it('records a completed, group-scoped SplitRequest and reduces the settlement', async () => {
    const container = createTestContainer();
    const members = [
      groupMemberFactory({ userId: 'jay', groupId: 'g2', displayName: 'jay' }),
      groupMemberFactory({ userId: 'marie', groupId: 'g2', displayName: 'marie' }),
    ];
    const group = groupFactory({ id: 'g2', members });
    const expense = expenseFactory({
      id: 'e1', groupId: 'g2', tripId: undefined, currency: 'EUR',
      totalAmountCents: 4000, paidByUserId: 'jay', settledAt: null,
      splits: [
        splitFactory({ id: 's1', expenseId: 'e1', userId: 'jay', amountOwedCents: 2000 }),
        splitFactory({ id: 's2', expenseId: 'e1', userId: 'marie', amountOwedCents: 2000 }),
      ],
    });

    const store = container.resolve(TRIP_STORE);
    store.getState().appendGroup(group);
    store.getState().appendGroupExpense(expense);

    const { result } = renderHook(() => useGroupDetail('g2'), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.settlements).toHaveLength(1);
    expect(result.current.archivableExpenseIds.has('e1')).toBe(false);

    await act(async () => {
      await result.current.recordPayment('marie', 'jay', 2000, 'EUR');
    });

    await waitFor(() => expect(result.current.settlements).toHaveLength(0));
    expect(result.current.archivableExpenseIds.has('e1')).toBe(true);

    const stored = await container.resolve(SPLIT_REQUEST_REPO).getSplitRequestsForGroup('g2');
    expect(stored.ok).toBe(true);
    if (!stored.ok) return;
    expect(stored.value).toHaveLength(1);
    expect(stored.value[0]).toMatchObject({
      groupId: 'g2', tripId: undefined,
      payerUserId: 'marie', requesterUserId: 'jay',
      amountCents: 2000, status: 'paid',
    });
  });
});

// ── closeExpense / closeTrip (archive quick-action) ─────────────────────────
// The icon on the group screen calls these directly, without navigating to
// the expense/trip detail screen first.

describe('useGroupDetail — closeExpense', () => {
  it('sets settledAt on the expense and moves it into closedExpenses', async () => {
    const expenseRepo = new InMemoryExpenseRepository();
    const expense = expenseFactory({ id: 'e1', groupId: 'g1', tripId: undefined, settledAt: null });
    expenseRepo.seed([expense]);
    const container = createTestContainer({ expenseRepo });
    const group = groupFactory({ id: 'g1', members: [groupMemberFactory()] });
    container.resolve(TRIP_STORE).getState().appendGroup(group);
    await container.resolve(TRIP_STORE).getState().loadGroupDetail('g1');

    const { result } = renderHook(() => useGroupDetail('g1'), { wrapper: makeWrapper(container) });
    expect(result.current.activeExpenses.map(e => e.id)).toEqual(['e1']);

    await act(async () => {
      const ok = await result.current.closeExpense(expense);
      expect(ok).toBe(true);
    });

    expect(result.current.activeExpenses).toHaveLength(0);
    expect(result.current.closedExpenses.map(e => e.id)).toEqual(['e1']);
  });
});

describe('useGroupDetail — closeTrip', () => {
  it('sets the trip status to closed and moves it into closedTrips', async () => {
    const container = createTestContainer();
    const group = groupFactory({ id: 'g1', members: [groupMemberFactory()] });
    const trip = tripFactory({ id: 't1', groupId: 'g1', status: 'active' });
    await container.resolve(TRIP_REPO).saveTrip(trip);
    const store = container.resolve(TRIP_STORE);
    store.getState().appendGroup(group);
    store.getState().appendTrip(trip);

    const { result } = renderHook(() => useGroupDetail('g1'), { wrapper: makeWrapper(container) });
    expect(result.current.activeTrips.map(t => t.id)).toEqual(['t1']);

    await act(async () => {
      const ok = await result.current.closeTrip(trip);
      expect(ok).toBe(true);
    });

    expect(result.current.activeTrips).toHaveLength(0);
    expect(result.current.closedTrips.map(t => t.id)).toEqual(['t1']);
  });
});
