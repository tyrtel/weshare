import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useGroupLedgerHistory } from '../hooks/useGroupLedgerHistory';
import { ServiceContext } from '../../../core/di/ServiceContext';
import { createTestContainer } from '../../../core/di/testContainer';
import { TRIP_STORE, SPLIT_REQUEST_REPO } from '../../../core/di/tokens';
import { InMemorySplitRequestRepository } from '../../../__mocks__/InMemorySplitRequestRepository';
import { groupFactory, groupMemberFactory, tripFactory, expenseFactory, splitFactory, splitRequestFactory } from '../../../__testUtils__/factories';
import type { ServiceContainer } from '../../../core/di/ServiceContainer';

function makeWrapper(container: ServiceContainer) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(ServiceContext.Provider, { value: container }, children);
  };
}

// Jay pays €40 directly in the group, Marie owes €20.
function seedBasic(container: ServiceContainer) {
  const members = [
    groupMemberFactory({ userId: 'jay', groupId: 'g1', displayName: 'jay' }),
    groupMemberFactory({ userId: 'marie', groupId: 'g1', displayName: 'marie' }),
  ];
  const group = groupFactory({ id: 'g1', members });
  const expense = expenseFactory({
    id: 'e1', groupId: 'g1', tripId: undefined, currency: 'EUR',
    totalAmountCents: 4000, paidByUserId: 'jay', settledAt: null,
    splits: [
      splitFactory({ id: 's1', expenseId: 'e1', userId: 'jay', amountOwedCents: 2000 }),
      splitFactory({ id: 's2', expenseId: 'e1', userId: 'marie', amountOwedCents: 2000 }),
    ],
  });
  const store = container.resolve(TRIP_STORE);
  store.getState().appendGroup(group);
  store.getState().appendGroupExpense(expense);
}

describe('useGroupLedgerHistory', () => {
  it('mixes a direct group expense debit with a trip-scoped completed payment credit', async () => {
    const container = createTestContainer();
    seedBasic(container);
    const trip = tripFactory({ id: 't1', groupId: 'g1', status: 'active' });
    container.resolve(TRIP_STORE).getState().appendTrip(trip);
    (container.resolve(SPLIT_REQUEST_REPO) as InMemorySplitRequestRepository).seed([
      splitRequestFactory({ id: 'r1', tripId: 't1', groupId: undefined, payerUserId: 'marie', requesterUserId: 'jay', amountCents: 1200, status: 'completed', updatedAt: new Date('2025-06-05') }),
    ]);

    const { result } = renderHook(() => useGroupLedgerHistory('g1', 'marie', 'jay'), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.entries).toHaveLength(2);
    expect(result.current.balanceCents).toBe(800);
  });

  it('recordPayment appends a completed group-scoped SplitRequest and the ledger reflects it', async () => {
    const container = createTestContainer();
    seedBasic(container);

    const { result } = renderHook(() => useGroupLedgerHistory('g1', 'marie', 'jay'), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.balanceCents).toBe(2000);

    await act(async () => { await result.current.recordPayment(2000); });

    await waitFor(() => expect(result.current.balanceCents).toBe(0));

    const stored = await container.resolve(SPLIT_REQUEST_REPO).getSplitRequestsForGroup('g1');
    expect(stored.ok && stored.value.some(r => r.amountCents === 2000 && r.status === 'paid')).toBe(true);
  });

  it('an overpayment produces a negative balance (a credit) rather than an error', async () => {
    const container = createTestContainer();
    seedBasic(container);

    const { result } = renderHook(() => useGroupLedgerHistory('g1', 'marie', 'jay'), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.recordPayment(3500); });

    await waitFor(() => expect(result.current.balanceCents).toBe(-1500));
  });
});
