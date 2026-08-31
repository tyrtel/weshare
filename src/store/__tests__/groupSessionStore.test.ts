import { InMemoryTripRepository } from '../../__mocks__/InMemoryTripRepository';
import { InMemoryMemberRepository } from '../../__mocks__/InMemoryMemberRepository';
import { InMemoryExpenseRepository } from '../../__mocks__/InMemoryExpenseRepository';
import { InMemorySplitRepository } from '../../__mocks__/InMemorySplitRepository';
import { InMemorySplitRequestRepository } from '../../__mocks__/InMemorySplitRequestRepository';
import { InMemoryGroupRepository } from '../../__mocks__/InMemoryGroupRepository';
import { createTripSessionStore } from '../tripSessionStore';
import type { TripSessionStoreApi } from '../tripSessionStore';
import { groupFactory, expenseFactory } from '../../__testUtils__/factories';

function makeStore(groupRepo?: InMemoryGroupRepository, expenseRepo?: InMemoryExpenseRepository): TripSessionStoreApi {
  return createTripSessionStore({
    trips:         new InMemoryTripRepository(),
    expenses:      expenseRepo ?? new InMemoryExpenseRepository(),
    members:       new InMemoryMemberRepository(),
    splits:        new InMemorySplitRepository(),
    splitRequests: new InMemorySplitRequestRepository(),
    groups:        groupRepo   ?? new InMemoryGroupRepository(),
  });
}

describe('initial group state', () => {
  it('starts with empty groups and groupExpenses', () => {
    const state = makeStore().getState();
    expect(state.groups).toEqual([]);
    expect(state.groupExpenses).toEqual({});
  });
});

describe('loadGroups', () => {
  it('populates groups from the repo', async () => {
    const g1 = groupFactory({ id: 'g1', ownerId: 'u1' });
    const g2 = groupFactory({ id: 'g2', ownerId: 'u1' });
    const groupRepo = new InMemoryGroupRepository().seed([g1, g2]);
    const store = makeStore(groupRepo);

    await store.getState().loadGroups('u1');
    expect(store.getState().groups).toHaveLength(2);
  });

  it('deduplicates concurrent calls — repo is only queried once', async () => {
    const groupRepo = new InMemoryGroupRepository().seed([groupFactory()]);
    const store = makeStore(groupRepo);
    const getSpy = jest.spyOn(groupRepo, 'getGroupsForUser');

    await Promise.all([
      store.getState().loadGroups('u1'),
      store.getState().loadGroups('u1'),
      store.getState().loadGroups('u1'),
    ]);

    expect(getSpy).toHaveBeenCalledTimes(1);
  });

  it('sets hydrationError on repo failure', async () => {
    const groupRepo = new InMemoryGroupRepository();
    jest.spyOn(groupRepo, 'getGroupsForUser').mockResolvedValueOnce({
      ok: false,
      error: { kind: 'NetworkError', message: 'failed' },
    });
    const store = makeStore(groupRepo);
    await store.getState().loadGroups('u1');
    expect(store.getState().hydrationError).not.toBeNull();
  });
});

describe('loadGroupDetail', () => {
  it('populates groupExpenses for the given groupId', async () => {
    const e1 = expenseFactory({ id: 'e1', groupId: 'g1', tripId: undefined });
    const e2 = expenseFactory({ id: 'e2', groupId: 'g1', tripId: undefined });
    const expenseRepo = new InMemoryExpenseRepository().seed([e1, e2]);
    const store = makeStore(undefined, expenseRepo);

    await store.getState().loadGroupDetail('g1');
    expect(store.getState().groupExpenses['g1']).toHaveLength(2);
  });
});

describe('addGroupExpense', () => {
  it('optimistically appends and then confirms the saved copy', async () => {
    const store = makeStore();
    const expense = expenseFactory({ id: 'e1', groupId: 'g1', tripId: undefined });
    await store.getState().addGroupExpense(expense);
    expect(store.getState().groupExpenses['g1']).toHaveLength(1);
    expect(store.getState().pendingExpenseIds).not.toContain('e1');
  });

  it('is a no-op when expense has no groupId', async () => {
    const store = makeStore();
    const expense = expenseFactory({ id: 'e1', tripId: 't1', groupId: undefined });
    await store.getState().addGroupExpense(expense);
    expect(store.getState().groupExpenses).toEqual({});
  });
});

describe('settleGroupExpenseInStore', () => {
  it('sets settledAt on the matching expense', async () => {
    const expense = expenseFactory({ id: 'e1', groupId: 'g1', tripId: undefined, settledAt: null });
    const store = makeStore();
    await store.getState().addGroupExpense(expense);

    const settledAt = new Date('2026-07-01T00:00:00Z');
    store.getState().settleGroupExpenseInStore('e1', 'g1', settledAt);

    const stored = store.getState().groupExpenses['g1']?.find(e => e.id === 'e1');
    expect(stored?.settledAt).toEqual(settledAt);
  });
});

describe('appendGroup / updateGroupInStore / removeGroup', () => {
  it('appendGroup adds to the groups list', () => {
    const store = makeStore();
    const g = groupFactory({ id: 'g1' });
    store.getState().appendGroup(g);
    expect(store.getState().groups).toHaveLength(1);
    expect(store.getState().groups[0].id).toBe('g1');
  });

  it('updateGroupInStore replaces by id', () => {
    const store = makeStore();
    const g = groupFactory({ id: 'g1', name: 'Original' });
    store.getState().appendGroup(g);
    store.getState().updateGroupInStore({ ...g, name: 'Updated' });
    expect(store.getState().groups[0].name).toBe('Updated');
  });

  it('removeGroup removes from groups and clears groupExpenses', async () => {
    const store = makeStore();
    const g = groupFactory({ id: 'g1' });
    const e = expenseFactory({ id: 'e1', groupId: 'g1', tripId: undefined });
    store.getState().appendGroup(g);
    await store.getState().addGroupExpense(e);

    store.getState().removeGroup('g1');
    expect(store.getState().groups).toHaveLength(0);
    expect(store.getState().groupExpenses['g1']).toBeUndefined();
  });
});
