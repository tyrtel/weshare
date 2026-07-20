import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { ServiceContext } from '../../../core/di/ServiceContext';
import { createTestContainer } from '../../../core/di/testContainer';
import { RECURRING_EXPENSE_REPO, TRIP_STORE } from '../../../core/di/tokens';
import { InMemoryRecurringExpenseRepository } from '../../../__mocks__/InMemoryRecurringExpenseRepository';
import { MockEntitlementService } from '../../../__mocks__/MockEntitlementService';
import { useRecurringExpenses } from '../hooks/useRecurringExpenses';
import { useCreateRecurringExpense } from '../hooks/useCreateRecurringExpense';
import { useEditRecurringExpense } from '../hooks/useEditRecurringExpense';
import { useDeleteRecurringExpense } from '../hooks/useDeleteRecurringExpense';
import { usePauseRecurringExpense } from '../hooks/usePauseRecurringExpense';
import { recurringExpenseFactory, recurringExpenseSplitFactory, groupFactory, groupMemberFactory } from '../../../__testUtils__/factories';
import type { ServiceContainer } from '../../../core/di/ServiceContainer';
import type { RecurringExpense } from '../../../core/models/RecurringExpense';

const GROUP_ID = 'g1';

function makeWrapper(container: ServiceContainer) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(ServiceContext.Provider, { value: container }, children);
  };
}

function makeContainer(reRepo?: InMemoryRecurringExpenseRepository, entitlementService?: MockEntitlementService) {
  const repo = reRepo ?? new InMemoryRecurringExpenseRepository();
  const container = createTestContainer({ recurringExpenseRepo: repo, entitlementService });
  const group = groupFactory({ id: GROUP_ID, members: [groupMemberFactory(), groupMemberFactory({ userId: 'u2', displayName: 'Sam' })] });
  container.resolve(TRIP_STORE).getState().appendGroup(group);
  return container;
}

// ── useRecurringExpenses ──────────────────────────────────────────────────────

describe('useRecurringExpenses', () => {
  it('returns empty array initially for a group with no templates', async () => {
    const container = makeContainer();
    const { result } = renderHook(() => useRecurringExpenses(GROUP_ID), { wrapper: makeWrapper(container) });
    await act(async () => {});
    expect(result.current.recurringExpenses).toEqual([]);
  });

  it('fetches and returns recurring expenses from the repo', async () => {
    const repo = new InMemoryRecurringExpenseRepository().seed([
      recurringExpenseFactory({ groupId: GROUP_ID }),
    ]);
    const container = makeContainer(repo);
    const { result } = renderHook(() => useRecurringExpenses(GROUP_ID), { wrapper: makeWrapper(container) });
    await act(async () => {});
    expect(result.current.recurringExpenses).toHaveLength(1);
    expect(result.current.recurringExpenses[0].description).toBe('Monthly rent');
  });

  it('reads from the store cache on second render without refetching', async () => {
    const repo = new InMemoryRecurringExpenseRepository();
    const container = makeContainer(repo);
    container.resolve(TRIP_STORE).getState().setRecurringExpensesForGroup(GROUP_ID, [
      recurringExpenseFactory({ groupId: GROUP_ID }),
    ]);

    const spy = jest.spyOn(repo, 'getRecurringExpensesForGroup');
    const { result } = renderHook(() => useRecurringExpenses(GROUP_ID), { wrapper: makeWrapper(container) });
    await act(async () => {});

    expect(spy).not.toHaveBeenCalled();
    expect(result.current.recurringExpenses).toHaveLength(1);
  });
});

// ── useCreateRecurringExpense ─────────────────────────────────────────────────

const FUTURE_DATE = new Date(Date.now() + 86_400_000 * 5); // 5 days from now

const validInput = {
  description:      'Rent',
  totalAmountCents: 6000,
  currency:         'EUR',
  paidByUserId:     'u1',
  period:           'monthly' as const,
  startDate:        FUTURE_DATE,
  createdByUserId:  'u1',
  splits: [
    { userId: 'u1', amountOwedCents: 3000 },
    { userId: 'u2', amountOwedCents: 3000 },
  ],
};

describe('useCreateRecurringExpense', () => {
  it('creates a recurring expense template and returns it', async () => {
    const container = makeContainer();
    const { result } = renderHook(() => useCreateRecurringExpense(GROUP_ID), { wrapper: makeWrapper(container) });

    let re: RecurringExpense | null = null;
    await act(async () => { re = await result.current.createRecurringExpense(validInput); });

    expect(re).not.toBeNull();
    expect(re?.description).toBe('Rent');
    expect(re?.groupId).toBe(GROUP_ID);
    expect(re?.period).toBe('monthly');
  });

  it('creates the first expense immediately in the expense repo', async () => {
    const container = makeContainer();
    const { result } = renderHook(() => useCreateRecurringExpense(GROUP_ID), { wrapper: makeWrapper(container) });

    await act(async () => { await result.current.createRecurringExpense(validInput); });

    const storeExpenses = container.resolve(TRIP_STORE).getState().groupExpenses[GROUP_ID] ?? [];
    expect(storeExpenses).toHaveLength(1);
    expect(storeExpenses[0].description).toBe('Rent');
  });

  it('sets nextDueAt to one period after startDate', async () => {
    const container = makeContainer();
    const { result } = renderHook(() => useCreateRecurringExpense(GROUP_ID), { wrapper: makeWrapper(container) });

    let re: RecurringExpense | null = null;
    await act(async () => { re = await result.current.createRecurringExpense(validInput); });

    const expectedNext = new Date(FUTURE_DATE);
    expectedNext.setMonth(expectedNext.getMonth() + 1);
    expect(re?.nextDueAt.getTime()).toBe(expectedNext.getTime());
  });

  it('appends the template to the store', async () => {
    const container = makeContainer();
    const { result } = renderHook(() => useCreateRecurringExpense(GROUP_ID), { wrapper: makeWrapper(container) });

    let re: RecurringExpense | null = null;
    await act(async () => { re = await result.current.createRecurringExpense(validInput); });

    const storeItems = container.resolve(TRIP_STORE).getState().recurringExpenses[GROUP_ID] ?? [];
    expect(storeItems.some(r => r.id === re!.id)).toBe(true);
  });

  it('returns null and ValidationError for empty description', async () => {
    const container = makeContainer();
    const { result } = renderHook(() => useCreateRecurringExpense(GROUP_ID), { wrapper: makeWrapper(container) });

    let re: RecurringExpense | null = null;
    await act(async () => { re = await result.current.createRecurringExpense({ ...validInput, description: '  ' }); });

    expect(re).toBeNull();
    expect(result.current.error?.kind).toBe('ValidationError');
  });

  it('returns null and ValidationError for past startDate', async () => {
    const container = makeContainer();
    const { result } = renderHook(() => useCreateRecurringExpense(GROUP_ID), { wrapper: makeWrapper(container) });

    const pastDate = new Date(Date.now() - 86_400_000 * 2);
    let re: RecurringExpense | null = null;
    await act(async () => {
      re = await result.current.createRecurringExpense({ ...validInput, startDate: pastDate });
    });

    expect(re).toBeNull();
    expect(result.current.error?.kind).toBe('ValidationError');
    expect(result.current.error?.field).toBe('startDate');
  });

  it('returns null and ValidationError when split total mismatches', async () => {
    const container = makeContainer();
    const { result } = renderHook(() => useCreateRecurringExpense(GROUP_ID), { wrapper: makeWrapper(container) });

    let re: RecurringExpense | null = null;
    await act(async () => {
      re = await result.current.createRecurringExpense({
        ...validInput,
        splits: [{ userId: 'u1', amountOwedCents: 999 }],
      });
    });

    expect(re).toBeNull();
    expect(result.current.error?.kind).toBe('ValidationError');
    expect(result.current.error?.field).toBe('splits');
  });

  it('skipFirstExpense skips creating the first expense but still saves the template', async () => {
    const container = makeContainer();
    const { result } = renderHook(() => useCreateRecurringExpense(GROUP_ID), { wrapper: makeWrapper(container) });

    let re: RecurringExpense | null = null;
    await act(async () => {
      re = await result.current.createRecurringExpense({ ...validInput, skipFirstExpense: true });
    });

    expect(re).not.toBeNull();
    // Template is in the store
    const storeItems = container.resolve(TRIP_STORE).getState().recurringExpenses[GROUP_ID] ?? [];
    expect(storeItems).toHaveLength(1);
    // No new expense created
    const storeExpenses = container.resolve(TRIP_STORE).getState().groupExpenses[GROUP_ID] ?? [];
    expect(storeExpenses).toHaveLength(0);
  });

  describe('monetization count-cap (Chunk G)', () => {
    it('sets limitReached and creates nothing once the group already has an active rule', async () => {
      const entitlement = new MockEntitlementService();
      entitlement.setActiveRecurringExpenseCount(GROUP_ID, 1);
      const container = makeContainer(undefined, entitlement);
      const { result } = renderHook(() => useCreateRecurringExpense(GROUP_ID), { wrapper: makeWrapper(container) });

      let re: RecurringExpense | null = null;
      await act(async () => { re = await result.current.createRecurringExpense(validInput); });

      expect(re).toBeNull();
      expect(result.current.limitReached).toBe(true);
      expect(result.current.error).toBeNull();
      // No orphaned first expense left behind from a rejected create.
      const storeExpenses = container.resolve(TRIP_STORE).getState().groupExpenses[GROUP_ID] ?? [];
      expect(storeExpenses).toHaveLength(0);
      const storeItems = container.resolve(TRIP_STORE).getState().recurringExpenses[GROUP_ID] ?? [];
      expect(storeItems).toHaveLength(0);
    });

    it('an active subscription bypasses an exhausted count cap', async () => {
      const entitlement = new MockEntitlementService();
      entitlement.setActiveRecurringExpenseCount(GROUP_ID, 1);
      entitlement.grantSubscription(new Date('2099-01-01T00:00:00Z'));
      const container = makeContainer(undefined, entitlement);
      const { result } = renderHook(() => useCreateRecurringExpense(GROUP_ID), { wrapper: makeWrapper(container) });

      let re: RecurringExpense | null = null;
      await act(async () => { re = await result.current.createRecurringExpense(validInput); });

      expect(re).not.toBeNull();
      expect(result.current.limitReached).toBe(false);
    });

    it('the count cap is per-group — a different group is unaffected', async () => {
      const entitlement = new MockEntitlementService();
      entitlement.setActiveRecurringExpenseCount('some-other-group', 1);
      const container = makeContainer(undefined, entitlement);
      const { result } = renderHook(() => useCreateRecurringExpense(GROUP_ID), { wrapper: makeWrapper(container) });

      let re: RecurringExpense | null = null;
      await act(async () => { re = await result.current.createRecurringExpense(validInput); });

      expect(re).not.toBeNull();
      expect(result.current.limitReached).toBe(false);
    });

    it('clearLimitReached resets limitReached', async () => {
      const entitlement = new MockEntitlementService();
      entitlement.setActiveRecurringExpenseCount(GROUP_ID, 1);
      const container = makeContainer(undefined, entitlement);
      const { result } = renderHook(() => useCreateRecurringExpense(GROUP_ID), { wrapper: makeWrapper(container) });

      await act(async () => { await result.current.createRecurringExpense(validInput); });
      expect(result.current.limitReached).toBe(true);

      act(() => { result.current.clearLimitReached(); });
      expect(result.current.limitReached).toBe(false);
    });
  });
});

// ── useEditRecurringExpense ───────────────────────────────────────────────────

describe('useEditRecurringExpense', () => {
  it('updates the template in the repo and the store', async () => {
    const re = recurringExpenseFactory({ groupId: GROUP_ID });
    const repo = new InMemoryRecurringExpenseRepository().seed([re]);
    const container = makeContainer(repo);
    container.resolve(TRIP_STORE).getState().setRecurringExpensesForGroup(GROUP_ID, [re]);

    const { result } = renderHook(() => useEditRecurringExpense(), { wrapper: makeWrapper(container) });

    const updated = { ...re, description: 'Updated rent' };
    let saved: RecurringExpense | null = null;
    await act(async () => { saved = await result.current.editRecurringExpense(updated); });

    expect(saved?.description).toBe('Updated rent');
    const storeItems = container.resolve(TRIP_STORE).getState().recurringExpenses[GROUP_ID] ?? [];
    expect(storeItems[0].description).toBe('Updated rent');
  });

  it('returns null and error when template not found', async () => {
    const container = makeContainer();
    const { result } = renderHook(() => useEditRecurringExpense(), { wrapper: makeWrapper(container) });

    let saved: RecurringExpense | null = null;
    await act(async () => { saved = await result.current.editRecurringExpense(recurringExpenseFactory({ id: 'nope' })); });

    expect(saved).toBeNull();
    expect(result.current.error?.kind).toBe('NotFoundError');
  });
});

// ── useDeleteRecurringExpense ─────────────────────────────────────────────────

describe('useDeleteRecurringExpense', () => {
  it('removes the template from the repo and the store', async () => {
    const re = recurringExpenseFactory({ groupId: GROUP_ID });
    const repo = new InMemoryRecurringExpenseRepository().seed([re]);
    const container = makeContainer(repo);
    container.resolve(TRIP_STORE).getState().setRecurringExpensesForGroup(GROUP_ID, [re]);

    const { result } = renderHook(() => useDeleteRecurringExpense(), { wrapper: makeWrapper(container) });

    let ok = false;
    await act(async () => { ok = await result.current.deleteRecurringExpense(re.id); });

    expect(ok).toBe(true);
    const storeItems = container.resolve(TRIP_STORE).getState().recurringExpenses[GROUP_ID] ?? [];
    expect(storeItems).toHaveLength(0);
  });

  it('returns false and error when template not found', async () => {
    const container = makeContainer();
    const { result } = renderHook(() => useDeleteRecurringExpense(), { wrapper: makeWrapper(container) });

    let ok = true;
    await act(async () => { ok = await result.current.deleteRecurringExpense('nope'); });

    expect(ok).toBe(false);
    expect(result.current.error?.kind).toBe('NotFoundError');
  });
});

// ── usePauseRecurringExpense ──────────────────────────────────────────────────

describe('usePauseRecurringExpense', () => {
  it('pauses a template and updates the store', async () => {
    const re = recurringExpenseFactory({ groupId: GROUP_ID, pausedAt: null });
    const repo = new InMemoryRecurringExpenseRepository().seed([re]);
    const container = makeContainer(repo);
    container.resolve(TRIP_STORE).getState().setRecurringExpensesForGroup(GROUP_ID, [re]);

    const { result } = renderHook(() => usePauseRecurringExpense(), { wrapper: makeWrapper(container) });

    let paused: RecurringExpense | null = null;
    await act(async () => { paused = await result.current.pause(re.id); });

    expect(paused?.pausedAt).toBeInstanceOf(Date);
    const storeItems = container.resolve(TRIP_STORE).getState().recurringExpenses[GROUP_ID] ?? [];
    expect(storeItems[0].pausedAt).toBeInstanceOf(Date);
  });

  it('resumes a paused template and clears pausedAt', async () => {
    const re = recurringExpenseFactory({ groupId: GROUP_ID, pausedAt: new Date() });
    const repo = new InMemoryRecurringExpenseRepository().seed([re]);
    const container = makeContainer(repo);
    container.resolve(TRIP_STORE).getState().setRecurringExpensesForGroup(GROUP_ID, [re]);

    const { result } = renderHook(() => usePauseRecurringExpense(), { wrapper: makeWrapper(container) });

    let resumed: RecurringExpense | null = null;
    await act(async () => { resumed = await result.current.resume(re.id); });

    expect(resumed?.pausedAt).toBeNull();
    const storeItems = container.resolve(TRIP_STORE).getState().recurringExpenses[GROUP_ID] ?? [];
    expect(storeItems[0].pausedAt).toBeNull();
  });

  it('returns null and error when template not found', async () => {
    const container = makeContainer();
    const { result } = renderHook(() => usePauseRecurringExpense(), { wrapper: makeWrapper(container) });

    let paused: RecurringExpense | null = null;
    await act(async () => { paused = await result.current.pause('nope'); });

    expect(paused).toBeNull();
    expect(result.current.error?.kind).toBe('NotFoundError');
  });
});
