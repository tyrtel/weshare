/**
 * 8.1 — Cache-invalidation integration tests.
 *
 * Verifies that mutations go through store actions and that hooks reading from
 * the store update reactively — without any manual `refetch()` call.
 */

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useSettlement } from '../../settlement/hooks/useSettlement';
import { useAddExpense } from '../hooks/useAddExpense';
import { ServiceContext } from '../../../core/di/ServiceContext';
import { createTestContainer } from '../../../core/di/testContainer';
import {
  SPLIT_REQUEST_REPO,
} from '../../../core/di/tokens';
import { InMemoryTripRepository } from '../../../__mocks__/InMemoryTripRepository';
import { InMemoryMemberRepository } from '../../../__mocks__/InMemoryMemberRepository';
import { InMemoryExpenseRepository } from '../../../__mocks__/InMemoryExpenseRepository';
import { InMemorySplitRepository } from '../../../__mocks__/InMemorySplitRepository';
import { InMemorySplitRequestRepository } from '../../../__mocks__/InMemorySplitRequestRepository';
import type { ServiceContainer } from '../../../core/di/ServiceContainer';
import { tripFactory, memberFactory, expenseFactory, splitFactory, splitRequestFactory } from '../../../__testUtils__/factories';

// ── Shared fixtures ───────────────────────────────────────────────────────────

const TRIP_ID = 't1';

function makeWrapper(container: ServiceContainer) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(ServiceContext.Provider, { value: container }, children);
  };
}

// ── 8.1.1 — addExpense → settlement updates without refetch ───────────────────
//
// Jay pays €100 for dinner; Jay and Marie each owe €50.
// Net: Marie→Jay 5000¢.
// After Marie pays €40 for coffee (Jay and Marie owe €20 each):
// Net: Marie→Jay 5000 − 2000 = 3000¢.

describe('cache invalidation — addExpense', () => {
  it('updates settlements reactively after addExpense without refetch', async () => {
    const dinnerSplits = [
      splitFactory({ id: 's1', expenseId: 'e1', userId: 'jay', amountOwedCents: 5000 }),
      splitFactory({ id: 's2', expenseId: 'e1', userId: 'marie', amountOwedCents: 5000 }),
    ];

    const splitRepo   = new InMemorySplitRepository().seed(dinnerSplits);
    const expenseRepo = new InMemoryExpenseRepository(splitRepo.splits).seed(
      [expenseFactory({ id: 'e1', paidByUserId: 'jay', totalAmountCents: 10000, description: 'e1', splits: dinnerSplits })], dinnerSplits,
    );
    const container = createTestContainer({
      tripRepo:   new InMemoryTripRepository().seed([tripFactory({ name: 'Test Trip', ownerId: 'jay' })]),
      memberRepo: new InMemoryMemberRepository().seed(['jay', 'marie'].map(id => memberFactory({ userId: id, displayName: id }))),
      expenseRepo,
      splitRepo,
    });

    const wrapper = makeWrapper(container);

    const { result: settlement } = renderHook(() => useSettlement(TRIP_ID), { wrapper });
    await waitFor(() => expect(settlement.current.loading).toBe(false));

    // Baseline: Marie owes Jay 5000¢.
    expect(settlement.current.settlements).toHaveLength(1);
    expect(settlement.current.settlements[0]).toMatchObject({
      fromUserId: 'marie', toUserId: 'jay', amountCents: 5000,
    });

    const { result: addExpense } = renderHook(() => useAddExpense(TRIP_ID), { wrapper });

    // Marie pays €40 coffee, equally split.
    await act(async () => {
      await addExpense.current.addExpense({
        description:      'Coffee',
        totalAmountCents: 4000,
        currency:         'EUR',
        paidByUserId:     'marie',
        splits: [
          { userId: 'jay',   amountOwedCents: 2000 },
          { userId: 'marie', amountOwedCents: 2000 },
        ],
      });
    });

    // Store updated via appendExpense — no refetch called.
    await waitFor(() => {
      expect(settlement.current.settlements).toHaveLength(1);
      expect(settlement.current.settlements[0].amountCents).toBe(3000);
    });
  });
});

// ── 8.1.2 — updateRequestStatus → latestRequest updates without refetch ───────

describe('cache invalidation — updateRequestStatus', () => {
  // A 'completed' SplitRequest is a completed ledger entry now (see core/logic/
  // settlement.ts's LedgerPayment credit filter) — the settlement it fully
  // covers disappears from the list instead of persisting with an updated
  // status label, unlike before.
  it('clears the settlement once the request completes, without a refetch', async () => {
    const splits = [
      splitFactory({ id: 's1', expenseId: 'e1', userId: 'jay', amountOwedCents: 5000 }),
      splitFactory({ id: 's2', expenseId: 'e1', userId: 'marie', amountOwedCents: 5000 }),
    ];
    const req = splitRequestFactory({ requesterUserId: 'jay', payerUserId: 'marie', amountCents: 5000, tripId: 't1', status: 'created' });

    const splitRepo   = new InMemorySplitRepository().seed(splits);
    const expenseRepo = new InMemoryExpenseRepository(splitRepo.splits).seed(
      [expenseFactory({ id: 'e1', paidByUserId: 'jay', totalAmountCents: 10000, description: 'e1', splits: splits })], splits,
    );
    const container = createTestContainer({
      tripRepo:         new InMemoryTripRepository().seed([tripFactory({ name: 'Test Trip', ownerId: 'jay' })]),
      memberRepo:       new InMemoryMemberRepository().seed(['jay', 'marie'].map(id => memberFactory({ userId: id, displayName: id }))),
      expenseRepo,
      splitRepo,
      splitRequestRepo: new InMemorySplitRequestRepository().seed([req]),
    });

    const wrapper = makeWrapper(container);

    const { result } = renderHook(() => useSettlement(TRIP_ID), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Baseline: latestRequest is 'created'.
    const before = result.current.settlements.find(
      (s) => s.fromUserId === 'marie' && s.toUserId === 'jay',
    );
    expect(before?.latestRequest?.status).toBe('created');

    const liveReq = before!.latestRequest!;

    await act(async () => {
      await result.current.updateRequestStatus(liveReq, 'completed');
    });

    // Store updated via updateSplitRequest — no refetch called. The completed
    // payment fully covers marie's debt, so her settlement row disappears.
    await waitFor(() => {
      const after = result.current.settlements.find(
        (s) => s.fromUserId === 'marie' && s.toUserId === 'jay',
      );
      expect(after).toBeUndefined();
    });

    const stored = await container.resolve(SPLIT_REQUEST_REPO).getSplitRequest(liveReq.id);
    expect(stored.ok && stored.value.status).toBe('completed');
  });
});
