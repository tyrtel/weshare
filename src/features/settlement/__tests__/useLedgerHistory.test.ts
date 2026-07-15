import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useLedgerHistory } from '../hooks/useLedgerHistory';
import { ServiceContext } from '../../../core/di/ServiceContext';
import { createTestContainer } from '../../../core/di/testContainer';
import { TRIP_REPO, MEMBER_REPO, EXPENSE_REPO, SPLIT_REPO, SPLIT_REQUEST_REPO } from '../../../core/di/tokens';
import { InMemoryTripRepository } from '../../../__mocks__/InMemoryTripRepository';
import { InMemoryMemberRepository } from '../../../__mocks__/InMemoryMemberRepository';
import { InMemoryExpenseRepository } from '../../../__mocks__/InMemoryExpenseRepository';
import { InMemorySplitRepository } from '../../../__mocks__/InMemorySplitRepository';
import { InMemorySplitRequestRepository } from '../../../__mocks__/InMemorySplitRequestRepository';
import type { ServiceContainer } from '../../../core/di/ServiceContainer';
import { tripFactory, memberFactory, expenseFactory, splitFactory, splitRequestFactory } from '../../../__testUtils__/factories';

function makeWrapper(container: ServiceContainer) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(ServiceContext.Provider, { value: container }, children);
  };
}

// Jay pays €40, Marie owes €20.
function seedBasic(container: ServiceContainer) {
  const splits = [
    splitFactory({ id: 's1', expenseId: 'e1', userId: 'jay', amountOwedCents: 2000 }),
    splitFactory({ id: 's2', expenseId: 'e1', userId: 'marie', amountOwedCents: 2000 }),
  ];
  (container.resolve(TRIP_REPO) as InMemoryTripRepository).seed([tripFactory({ ownerId: 'jay' })]);
  (container.resolve(MEMBER_REPO) as InMemoryMemberRepository).seed(
    ['jay', 'marie'].map(id => memberFactory({ userId: id, displayName: id })),
  );
  (container.resolve(EXPENSE_REPO) as InMemoryExpenseRepository).seed(
    [expenseFactory({ id: 'e1', tripId: 't1', paidByUserId: 'jay', totalAmountCents: 4000, description: 'Dinner' })], splits,
  );
  (container.resolve(SPLIT_REPO) as InMemorySplitRepository).seed(splits);
}

describe('useLedgerHistory', () => {
  it('mixes the expense debit and a completed payment credit into one ledger', async () => {
    const container = createTestContainer();
    seedBasic(container);
    (container.resolve(SPLIT_REQUEST_REPO) as InMemorySplitRequestRepository).seed([
      splitRequestFactory({ id: 'r1', tripId: 't1', payerUserId: 'marie', requesterUserId: 'jay', amountCents: 1200, status: 'completed', updatedAt: new Date('2025-06-05') }),
    ]);

    const { result } = renderHook(() => useLedgerHistory('t1', 'marie', 'jay'), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.entries).toHaveLength(2);
    expect(result.current.entries[0]).toMatchObject({ type: 'expense', amountCents: 2000 });
    expect(result.current.entries[1]).toMatchObject({ type: 'payment', amountCents: -1200 });
    expect(result.current.balanceCents).toBe(800);
  });

  it('excludes in-flight (not yet completed) SplitRequests from the ledger', async () => {
    const container = createTestContainer();
    seedBasic(container);
    (container.resolve(SPLIT_REQUEST_REPO) as InMemorySplitRequestRepository).seed([
      splitRequestFactory({ id: 'r1', tripId: 't1', payerUserId: 'marie', requesterUserId: 'jay', amountCents: 1200, status: 'pending' }),
    ]);

    const { result } = renderHook(() => useLedgerHistory('t1', 'marie', 'jay'), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.entries).toHaveLength(1);
    expect(result.current.balanceCents).toBe(2000);
  });

  it('recordPayment appends a completed SplitRequest and the ledger reflects it', async () => {
    const container = createTestContainer();
    seedBasic(container);

    const { result } = renderHook(() => useLedgerHistory('t1', 'marie', 'jay'), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.balanceCents).toBe(2000);

    await act(async () => { await result.current.recordPayment(2000); });

    await waitFor(() => expect(result.current.balanceCents).toBe(0));
    expect(result.current.entries.some(e => e.type === 'payment' && e.amountCents === -2000)).toBe(true);
  });

  it('an overpayment produces a negative balance (a credit) rather than an error', async () => {
    const container = createTestContainer();
    seedBasic(container);

    const { result } = renderHook(() => useLedgerHistory('t1', 'marie', 'jay'), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.recordPayment(3500); });

    await waitFor(() => expect(result.current.balanceCents).toBe(-1500));
  });

  it('starts in loading state', () => {
    const container = createTestContainer();
    (container.resolve(TRIP_REPO) as InMemoryTripRepository).seed([tripFactory({ ownerId: 'jay' })]);
    (container.resolve(MEMBER_REPO) as InMemoryMemberRepository).seed([]);

    const { result } = renderHook(() => useLedgerHistory('t1', 'marie', 'jay'), { wrapper: makeWrapper(container) });

    expect(result.current.loading).toBe(true);
  });
});
