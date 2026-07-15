import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useSettlement } from '../hooks/useSettlement';
import { ServiceContext } from '../../../core/di/ServiceContext';
import { createTestContainer } from '../../../core/di/testContainer';
import { TRIP_REPO, MEMBER_REPO, EXPENSE_REPO, SPLIT_REPO, SPLIT_REQUEST_REPO, AUTH } from '../../../core/di/tokens';
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

// ── Fixtures ──────────────────────────────────────────────────────────────────





// Seed: Jay pays €100 equally among jay/marie/tom/sara (2500 each).
// Net: Jay +7500, others −2500 each.
function seedEqualSplit(container: ServiceContainer) {
  const splits = [
    splitFactory({ id: 's1', expenseId: 'e1', userId: 'jay', amountOwedCents: 2500 }),
    splitFactory({ id: 's2', expenseId: 'e1', userId: 'marie', amountOwedCents: 2500 }),
    splitFactory({ id: 's3', expenseId: 'e1', userId: 'tom', amountOwedCents: 2500 }),
    splitFactory({ id: 's4', expenseId: 'e1', userId: 'sara', amountOwedCents: 2500 }),
  ];
  (container.resolve(TRIP_REPO) as InMemoryTripRepository).seed([tripFactory({ ownerId: 'jay' })]);
  (container.resolve(MEMBER_REPO) as InMemoryMemberRepository).seed(
    ['jay', 'marie', 'tom', 'sara'].map(id => memberFactory({ userId: id, displayName: id })),
  );
  (container.resolve(EXPENSE_REPO) as InMemoryExpenseRepository).seed(
    [expenseFactory({ id: 'e1', tripId: 't1', paidByUserId: 'jay', totalAmountCents: 10000, description: 'e1' })], splits,
  );
  (container.resolve(SPLIT_REPO) as InMemorySplitRepository).seed(splits);
}

// ── Loading / error states ────────────────────────────────────────────────────

describe('useSettlement — loading', () => {
  it('starts with loading=true', () => {
    const container = createTestContainer();
    (container.resolve(TRIP_REPO) as InMemoryTripRepository).seed([tripFactory({ ownerId: 'jay' })]);
    (container.resolve(MEMBER_REPO) as InMemoryMemberRepository).seed([]);

    const { result } = renderHook(() => useSettlement('t1'), { wrapper: makeWrapper(container) });

    expect(result.current.loading).toBe(true);
  });

  it('loading becomes false after data resolves', async () => {
    const container = createTestContainer();
    seedEqualSplit(container);

    const { result } = renderHook(() => useSettlement('t1'), { wrapper: makeWrapper(container) });

    await waitFor(() => expect(result.current.loading).toBe(false));
  });
});

// ── Settlement computation ────────────────────────────────────────────────────

describe('useSettlement — computation', () => {
  it('returns empty settlements when there are no expenses', async () => {
    const container = createTestContainer();
    (container.resolve(TRIP_REPO) as InMemoryTripRepository).seed([tripFactory({ ownerId: 'jay' })]);
    (container.resolve(MEMBER_REPO) as InMemoryMemberRepository).seed(
      ['jay', 'marie'].map(id => memberFactory({ userId: id, displayName: id })),
    );

    const { result } = renderHook(() => useSettlement('t1'), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.settlements).toHaveLength(0);
  });

  it('returns correct settlement count for a 4-way equal split', async () => {
    const container = createTestContainer();
    seedEqualSplit(container);

    const { result } = renderHook(() => useSettlement('t1'), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Jay +75, Marie/Tom/Sara −25 each → 3 transfers
    expect(result.current.settlements).toHaveLength(3);
  });

  it('enriches settlements with display names', async () => {
    const container = createTestContainer();
    seedEqualSplit(container);

    const { result } = renderHook(() => useSettlement('t1'), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const s = result.current.settlements;
    expect(s.every(item => typeof item.fromDisplayName === 'string')).toBe(true);
    expect(s.every(item => typeof item.toDisplayName === 'string')).toBe(true);
    // All creditors are Jay in this scenario
    expect(s.every(item => item.toDisplayName === 'jay')).toBe(true);
  });

  it('each settlement carries the correct amount', async () => {
    const container = createTestContainer();
    seedEqualSplit(container);

    const { result } = renderHook(() => useSettlement('t1'), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    for (const s of result.current.settlements) {
      expect(s.amountCents).toBe(2500);
    }
  });

  it('exposes the correct currency', async () => {
    const container = createTestContainer();
    seedEqualSplit(container);

    const { result } = renderHook(() => useSettlement('t1'), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.settlements.every(s => s.currency === 'EUR')).toBe(true);
  });

  it('a completed SplitRequest reduces the computed settlement — the ledger actually works now', async () => {
    const container = createTestContainer();
    seedEqualSplit(container);
    (container.resolve(SPLIT_REQUEST_REPO) as InMemorySplitRequestRepository).seed([
      splitRequestFactory({ id: 'r1', tripId: 't1', payerUserId: 'marie', requesterUserId: 'jay', amountCents: 2500, status: 'completed' }),
    ]);

    const { result } = renderHook(() => useSettlement('t1'), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Marie's €25 debt is fully covered by the completed payment — her
    // transfer drops out, leaving only Tom and Sara.
    expect(result.current.settlements).toHaveLength(2);
    expect(result.current.settlements.some(s => s.fromUserId === 'marie')).toBe(false);
  });

  it('an in-flight (not yet completed) SplitRequest does not affect the settlement', async () => {
    const container = createTestContainer();
    seedEqualSplit(container);
    (container.resolve(SPLIT_REQUEST_REPO) as InMemorySplitRequestRepository).seed([
      splitRequestFactory({ id: 'r1', tripId: 't1', payerUserId: 'marie', requesterUserId: 'jay', amountCents: 2500, status: 'pending' }),
    ]);

    const { result } = renderHook(() => useSettlement('t1'), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.settlements).toHaveLength(3);
  });
});

// ── Current user ──────────────────────────────────────────────────────────────

describe('useSettlement — currentUserId', () => {
  it('is null when no user is signed in', async () => {
    const container = createTestContainer();
    seedEqualSplit(container);

    const { result } = renderHook(() => useSettlement('t1'), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.currentUserId).toBeNull();
  });

  it('reflects the signed-in user id', async () => {
    const container = createTestContainer();
    seedEqualSplit(container);
    await container.resolve(AUTH).signIn('jay@example.com', 'password');

    const { result } = renderHook(() => useSettlement('t1'), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.currentUserId).toBe('user_jay@example.com');
  });
});

// ── recordPayment ────────────────────────────────────────────────────────────
// The ledger's sole write primitive, replacing markSettled/markDebtPaid/
// markDebtOwed — see splitRequest.test.ts for the full repo-round-trip coverage.

describe('useSettlement — recordPayment', () => {
  it('a full-amount payment clears the settlement from the list', async () => {
    const container = createTestContainer();
    const splits = [splitFactory({ id: 's1', expenseId: 'e1', userId: 'jay', amountOwedCents: 2500 }), splitFactory({ id: 's2', expenseId: 'e1', userId: 'marie', amountOwedCents: 2500 })];
    (container.resolve(TRIP_REPO) as InMemoryTripRepository).seed([tripFactory({ ownerId: 'jay' })]);
    (container.resolve(MEMBER_REPO) as InMemoryMemberRepository).seed(
      ['jay', 'marie'].map(id => memberFactory({ userId: id, displayName: id })),
    );
    (container.resolve(EXPENSE_REPO) as InMemoryExpenseRepository).seed(
      [expenseFactory({ id: 'e1', tripId: 't1', paidByUserId: 'jay', totalAmountCents: 5000, description: 'e1' })], splits,
    );
    (container.resolve(SPLIT_REPO) as InMemorySplitRepository).seed(splits);

    const { result } = renderHook(() => useSettlement('t1'), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.settlements).toHaveLength(1);

    await act(async () => {
      await result.current.recordPayment('marie', 'jay', 2500, 'EUR');
    });

    await waitFor(() => expect(result.current.settlements).toHaveLength(0));
  });

  it('a partial payment reduces the settlement amount instead of clearing it', async () => {
    const container = createTestContainer();
    const splits = [splitFactory({ id: 's1', expenseId: 'e1', userId: 'jay', amountOwedCents: 2500 }), splitFactory({ id: 's2', expenseId: 'e1', userId: 'marie', amountOwedCents: 2500 })];
    (container.resolve(TRIP_REPO) as InMemoryTripRepository).seed([tripFactory({ ownerId: 'jay' })]);
    (container.resolve(MEMBER_REPO) as InMemoryMemberRepository).seed(
      ['jay', 'marie'].map(id => memberFactory({ userId: id, displayName: id })),
    );
    (container.resolve(EXPENSE_REPO) as InMemoryExpenseRepository).seed(
      [expenseFactory({ id: 'e1', tripId: 't1', paidByUserId: 'jay', totalAmountCents: 5000, description: 'e1' })], splits,
    );
    (container.resolve(SPLIT_REPO) as InMemorySplitRepository).seed(splits);

    const { result } = renderHook(() => useSettlement('t1'), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.recordPayment('marie', 'jay', 1000, 'EUR');
    });

    await waitFor(() => {
      const marieRow = result.current.settlements.find(s => s.fromUserId === 'marie');
      return marieRow?.amountCents === 1500;
    });
  });
});
