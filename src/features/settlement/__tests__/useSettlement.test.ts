import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useSettlement } from '../hooks/useSettlement';
import { ServiceContext } from '../../../core/di/ServiceContext';
import { createTestContainer } from '../../../core/di/testContainer';
import { TRIP_REPO, MEMBER_REPO, EXPENSE_REPO, SPLIT_REPO, AUTH } from '../../../core/di/tokens';
import { InMemoryTripRepository } from '../../../__mocks__/InMemoryTripRepository';
import { InMemoryMemberRepository } from '../../../__mocks__/InMemoryMemberRepository';
import { InMemoryExpenseRepository } from '../../../__mocks__/InMemoryExpenseRepository';
import { InMemorySplitRepository } from '../../../__mocks__/InMemorySplitRepository';
import { err } from '../../../core/types/Result';
import type { ServiceContainer } from '../../../core/di/ServiceContainer';
import type { Split } from '../../../core/models/Split';
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
    await container.resolve(AUTH).signInAsGuest('jay');

    const { result } = renderHook(() => useSettlement('t1'), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.currentUserId).toBe('guest_jay');
  });
});

// ── markSettled ───────────────────────────────────────────────────────────────

describe('useSettlement — markSettled', () => {
  it('removes the settlement after marking it settled', async () => {
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
      await result.current.markSettled('marie', 'jay');
    });

    await waitFor(() => expect(result.current.settlements).toHaveLength(0));
  });

  it('returns true on success', async () => {
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

    let outcome: boolean | undefined;
    await act(async () => { outcome = await result.current.markSettled('marie', 'jay'); });

    expect(outcome).toBe(true);
  });

  it('sets error and returns false when one of multiple split updates fails', async () => {
    const container = createTestContainer();
    // Two expenses both paid by jay, each with a split for marie — produces two markSettled calls
    const splits = [
      splitFactory({ id: 's1', expenseId: 'e1', userId: 'marie', amountOwedCents: 2500 }),
      splitFactory({ id: 's2', expenseId: 'e2', userId: 'marie', amountOwedCents: 2500 }),
    ];
    (container.resolve(TRIP_REPO) as InMemoryTripRepository).seed([tripFactory({ ownerId: 'jay' })]);
    (container.resolve(MEMBER_REPO) as InMemoryMemberRepository).seed(
      ['jay', 'marie'].map(id => memberFactory({ userId: id, displayName: id })),
    );
    (container.resolve(EXPENSE_REPO) as InMemoryExpenseRepository).seed(
      [expenseFactory({ id: 'e1', tripId: 't1', paidByUserId: 'jay', totalAmountCents: 5000, description: 'e1' }), expenseFactory({ id: 'e2', tripId: 't1', paidByUserId: 'jay', totalAmountCents: 5000, description: 'e2' })],
      splits,
    );
    const splitRepo = container.resolve(SPLIT_REPO) as InMemorySplitRepository;
    splitRepo.seed(splits);

    // s1 fails, s2 succeeds — partial failure
    const originalUpdate = splitRepo.updateSplit;
    splitRepo.updateSplit = async (split: Split) => {
      if (split.id === 's1') return err({ kind: 'NetworkError', message: 'network failure' });
      return originalUpdate(split);
    };

    const { result } = renderHook(() => useSettlement('t1'), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let outcome: boolean | undefined;
    await act(async () => { outcome = await result.current.markSettled('marie', 'jay'); });

    expect(outcome).toBe(false);
    expect(result.current.error).toMatchObject({ kind: 'NetworkError', message: 'network failure' });
  });

  it('does not settle the wrong pair', async () => {
    const container = createTestContainer();
    // Jay pays €60 for food (marie/tom/jay). Marie pays €30 for wine (jay/marie).
    // Net: Jay +40−15=+25, Marie −20+15=−5, Tom −20.
    // Settlements: Tom→Jay 20, Marie→Jay 5.
    const foodSplits = [
      splitFactory({ id: 'f1', expenseId: 'food', userId: 'jay', amountOwedCents: 2000 }),
      splitFactory({ id: 'f2', expenseId: 'food', userId: 'marie', amountOwedCents: 2000 }),
      splitFactory({ id: 'f3', expenseId: 'food', userId: 'tom', amountOwedCents: 2000 }),
    ];
    const wineSplits = [
      splitFactory({ id: 'w1', expenseId: 'wine', userId: 'jay', amountOwedCents: 1500 }),
      splitFactory({ id: 'w2', expenseId: 'wine', userId: 'marie', amountOwedCents: 1500 }),
    ];
    const allSplits = [...foodSplits, ...wineSplits];
    (container.resolve(TRIP_REPO) as InMemoryTripRepository).seed([tripFactory({ ownerId: 'jay' })]);
    (container.resolve(MEMBER_REPO) as InMemoryMemberRepository).seed(
      ['jay', 'marie', 'tom'].map(id => memberFactory({ userId: id, displayName: id })),
    );
    (container.resolve(EXPENSE_REPO) as InMemoryExpenseRepository).seed(
      [expenseFactory({ id: 'food', tripId: 't1', paidByUserId: 'jay', totalAmountCents: 6000, description: 'food' }), expenseFactory({ id: 'wine', tripId: 't1', paidByUserId: 'marie', totalAmountCents: 3000, description: 'wine' })],
      allSplits,
    );
    (container.resolve(SPLIT_REPO) as InMemorySplitRepository).seed(allSplits);

    const { result } = renderHook(() => useSettlement('t1'), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const before = result.current.settlements.length;
    expect(before).toBeGreaterThan(0);

    // Settle only Tom's debt to Jay
    await act(async () => { await result.current.markSettled('tom', 'jay'); });
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Marie's debt to Jay should still exist
    const marieOwesJay = result.current.settlements.some(
      s => s.fromUserId === 'marie' && s.toUserId === 'jay',
    );
    expect(marieOwesJay).toBe(true);
  });
});
