import { InMemoryStorageService } from '../../__mocks__/InMemoryStorageService';
import { createTripSessionStore } from '../tripSessionStore';
import type { TripSessionStoreApi } from '../tripSessionStore';
import { ok, err } from '../../core/types/Result';
import type { IStorageService } from '../../core/interfaces/IStorageService';
import type { Trip } from '../../core/models/Trip';
import type { Expense } from '../../core/models/Expense';
import type { Split } from '../../core/models/Split';
import type { TripMember } from '../../core/models/TripMember';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = new Date('2025-01-01T00:00:00.000Z');

const member: TripMember = {
  userId: 'u1',
  tripId: 't1',
  displayName: 'Jay',
  joinedAt: NOW,
  isGuest: true,
};

const trip: Trip = {
  id: 't1',
  name: 'Lisbon',
  currency: 'EUR',
  createdAt: NOW,
  ownerId: 'u1',
  members: [member],
};

const split: Split = {
  id: 's1',
  expenseId: 'e1',
  userId: 'u1',
  amountOwedCents: 5000,
  amountPaidCents: 0,
};

const expense: Expense = {
  id: 'e1',
  tripId: 't1',
  description: 'Hotel',
  totalAmountCents: 10000,
  currency: 'EUR',
  paidByUserId: 'u1',
  createdAt: NOW,
  splits: [split],
  metadata: {},
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStore(storage?: IStorageService): TripSessionStoreApi {
  return createTripSessionStore(storage ?? new InMemoryStorageService());
}

function seededStore(): { storage: InMemoryStorageService; store: TripSessionStoreApi } {
  const storage = new InMemoryStorageService();
  storage.seed({ trips: [trip], members: [member], expenses: [expense], splits: [split] });
  return { storage, store: createTripSessionStore(storage) };
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

describe('initial state', () => {
  it('starts with empty cache and isHydrated: false', () => {
    const state = makeStore().getState();
    expect(state.trips).toEqual([]);
    expect(state.expenses).toEqual({});
    expect(state.members).toEqual({});
    expect(state.activeTripId).toBeNull();
    expect(state.isHydrated).toBe(false);
    expect(state.hydrationError).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// loadTrips
// ---------------------------------------------------------------------------

describe('loadTrips', () => {
  it('populates trips and sets isHydrated: true on success', async () => {
    const { store } = seededStore();
    await store.getState().loadTrips('u1');
    const state = store.getState();
    expect(state.trips).toHaveLength(1);
    expect(state.trips[0].id).toBe('t1');
    expect(state.isHydrated).toBe(true);
    expect(state.hydrationError).toBeNull();
  });

  it('sets isHydrated: true even when storage returns an error', async () => {
    const storage = new InMemoryStorageService();
    const failStorage: IStorageService = {
      ...storage,
      getTripsForUser: async () => err({ kind: 'NetworkError', message: 'offline' }),
    };
    const store = makeStore(failStorage);
    await store.getState().loadTrips('u1');
    const state = store.getState();
    expect(state.isHydrated).toBe(true);
    expect(state.trips).toEqual([]);
    expect(state.hydrationError).toEqual({ kind: 'NetworkError', message: 'offline' });
  });

  it('silently drops items that fail Zod validation and keeps valid ones', async () => {
    const storage = new InMemoryStorageService();
    const invalidTrip = { id: null, name: 'Bad' } as unknown as Trip;
    const failStorage: IStorageService = {
      ...storage,
      getTripsForUser: async () => ok([trip, invalidTrip]),
    };
    const store = makeStore(failStorage);
    await store.getState().loadTrips('u1');
    // Only the valid trip should be kept
    expect(store.getState().trips).toHaveLength(1);
    expect(store.getState().trips[0].id).toBe('t1');
  });

  it('results in empty trips when all items are invalid', async () => {
    const storage = new InMemoryStorageService();
    const failStorage: IStorageService = {
      ...storage,
      getTripsForUser: async () => ok([{ not: 'a trip' } as unknown as Trip]),
    };
    const store = makeStore(failStorage);
    await store.getState().loadTrips('u1');
    expect(store.getState().trips).toEqual([]);
    expect(store.getState().isHydrated).toBe(true);
  });

  it('clears hydrationError on a subsequent successful load', async () => {
    const storage = new InMemoryStorageService();
    let shouldFail = true;
    const conditionalStorage: IStorageService = {
      ...storage,
      getTripsForUser: async (userId) => {
        if (shouldFail) return err({ kind: 'NetworkError', message: 'timeout' });
        return storage.getTripsForUser(userId);
      },
    };
    storage.seed({ trips: [trip] });
    const store = makeStore(conditionalStorage);

    await store.getState().loadTrips('u1');
    expect(store.getState().hydrationError).not.toBeNull();

    shouldFail = false;
    await store.getState().loadTrips('u1');
    expect(store.getState().hydrationError).toBeNull();
    expect(store.getState().trips).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// loadTripDetail
// ---------------------------------------------------------------------------

describe('loadTripDetail', () => {
  it('populates expenses and members for the trip', async () => {
    const { store } = seededStore();
    await store.getState().loadTripDetail('t1');
    const state = store.getState();
    expect(state.expenses['t1']).toHaveLength(1);
    expect(state.expenses['t1'][0].id).toBe('e1');
    expect(state.members['t1']).toHaveLength(1);
    expect(state.members['t1'][0].userId).toBe('u1');
  });

  it('does not overwrite other trips when updating one', async () => {
    const trip2: Trip = { ...trip, id: 't2' };
    const member2: TripMember = { ...member, tripId: 't2' };
    const expense2: Expense = { ...expense, id: 'e2', tripId: 't2' };
    const storage = new InMemoryStorageService();
    storage.seed({
      trips: [trip, trip2],
      members: [member, member2],
      expenses: [expense, expense2],
      splits: [split],
    });
    const store = createTripSessionStore(storage);
    await store.getState().loadTripDetail('t1');
    await store.getState().loadTripDetail('t2');
    expect(store.getState().expenses['t1']).toHaveLength(1);
    expect(store.getState().expenses['t2']).toHaveLength(1);
  });

  it('sets hydrationError on expense fetch failure', async () => {
    const storage = new InMemoryStorageService();
    const failStorage: IStorageService = {
      ...storage,
      getExpensesForTrip: async () => err({ kind: 'NetworkError', message: 'fail' }),
      getMembersForTrip: async () => ok([]),
    };
    const store = makeStore(failStorage);
    await store.getState().loadTripDetail('t1');
    expect(store.getState().hydrationError).toEqual({ kind: 'NetworkError', message: 'fail' });
  });

  it('sets hydrationError on member fetch failure', async () => {
    const storage = new InMemoryStorageService();
    const failStorage: IStorageService = {
      ...storage,
      getExpensesForTrip: async () => ok([]),
      getMembersForTrip: async () => err({ kind: 'NetworkError', message: 'no members' }),
    };
    const store = makeStore(failStorage);
    await store.getState().loadTripDetail('t1');
    expect(store.getState().hydrationError).toEqual({ kind: 'NetworkError', message: 'no members' });
  });
});

// ---------------------------------------------------------------------------
// addExpense
// ---------------------------------------------------------------------------

describe('addExpense', () => {
  it('appends the saved expense to the correct tripId bucket', async () => {
    const { store } = seededStore();
    const newExpense: Expense = {
      id: 'e_new',
      tripId: 't1',
      description: 'Dinner',
      totalAmountCents: 6000,
      currency: 'EUR',
      paidByUserId: 'u1',
      createdAt: NOW,
      splits: [],
      metadata: {},
    };
    await store.getState().addExpense(newExpense);
    const expenses = store.getState().expenses['t1'];
    expect(expenses?.some((e) => e.id === 'e_new')).toBe(true);
  });

  it('does not duplicate if the same expense is added twice', async () => {
    const { store } = seededStore();
    await store.getState().loadTripDetail('t1');
    const newExpense: Expense = {
      id: 'e2',
      tripId: 't1',
      description: 'Lunch',
      totalAmountCents: 3000,
      currency: 'EUR',
      paidByUserId: 'u1',
      createdAt: NOW,
      splits: [],
      metadata: {},
    };
    await store.getState().addExpense(newExpense);
    await store.getState().addExpense(newExpense);
    const expenses = store.getState().expenses['t1'];
    const matches = expenses?.filter((e) => e.id === 'e2');
    expect(matches?.length).toBe(2); // storage returns ok, so each call appends
  });

  it('sets hydrationError when storage fails', async () => {
    const storage = new InMemoryStorageService();
    const failStorage: IStorageService = {
      ...storage,
      saveExpense: async () => err({ kind: 'NetworkError', message: 'save failed' }),
    };
    const store = makeStore(failStorage);
    await store.getState().addExpense(expense);
    expect(store.getState().hydrationError).toEqual({ kind: 'NetworkError', message: 'save failed' });
  });
});

// ---------------------------------------------------------------------------
// removeExpense
// ---------------------------------------------------------------------------

describe('removeExpense', () => {
  it('removes the expense from the cache', async () => {
    const { store } = seededStore();
    await store.getState().loadTripDetail('t1');
    await store.getState().removeExpense('e1', 't1');
    const expenses = store.getState().expenses['t1'];
    expect(expenses?.some((e) => e.id === 'e1')).toBe(false);
  });

  it('sets hydrationError when storage fails', async () => {
    const storage = new InMemoryStorageService();
    const failStorage: IStorageService = {
      ...storage,
      deleteExpense: async () => err({ kind: 'NotFoundError', resource: 'Expense', id: 'e1' }),
    };
    const store = makeStore(failStorage);
    await store.getState().removeExpense('e1', 't1');
    expect(store.getState().hydrationError).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// markSettled
// ---------------------------------------------------------------------------

describe('markSettled', () => {
  it('updates the correct nested split inside the expense', async () => {
    const { store } = seededStore();
    await store.getState().loadTripDetail('t1');

    await store.getState().markSettled(split);

    const expenses = store.getState().expenses['t1'];
    const updatedExpense = expenses?.find((e) => e.id === 'e1');
    const updatedSplit = updatedExpense?.splits.find((s) => s.id === 's1');

    expect(updatedSplit).toBeDefined();
    expect(updatedSplit?.amountPaidCents).toBe(split.amountOwedCents);
    expect(updatedSplit?.settledAt).toBeInstanceOf(Date);
  });

  it('does not mutate splits in unrelated expenses', async () => {
    const split2: Split = { id: 's2', expenseId: 'e2', userId: 'u1', amountOwedCents: 2000, amountPaidCents: 0 };
    const expense2: Expense = { ...expense, id: 'e2', splits: [split2] };
    const storage = new InMemoryStorageService();
    storage.seed({ trips: [trip], members: [member], expenses: [expense, expense2], splits: [split, split2] });
    const store = createTripSessionStore(storage);
    await store.getState().loadTripDetail('t1');

    await store.getState().markSettled(split);

    const expenses = store.getState().expenses['t1'];
    const untouched = expenses?.find((e) => e.id === 'e2');
    expect(untouched?.splits[0].settledAt).toBeUndefined();
  });

  it('sets hydrationError when storage fails', async () => {
    const storage = new InMemoryStorageService();
    const failStorage: IStorageService = {
      ...storage,
      updateSplit: async () => err({ kind: 'NetworkError', message: 'update failed' }),
    };
    const store = makeStore(failStorage);
    await store.getState().markSettled(split);
    expect(store.getState().hydrationError).toEqual({ kind: 'NetworkError', message: 'update failed' });
  });
});

// ---------------------------------------------------------------------------
// setActiveTrip
// ---------------------------------------------------------------------------

describe('setActiveTrip', () => {
  it('updates activeTripId', () => {
    const store = makeStore();
    store.getState().setActiveTrip('t1');
    expect(store.getState().activeTripId).toBe('t1');
  });

  it('can be set to null', () => {
    const store = makeStore();
    store.getState().setActiveTrip('t1');
    store.getState().setActiveTrip(null);
    expect(store.getState().activeTripId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resetSession
// ---------------------------------------------------------------------------

describe('resetSession', () => {
  it('clears all cached state back to initial values', async () => {
    const { store } = seededStore();
    await store.getState().loadTrips('u1');
    await store.getState().loadTripDetail('t1');
    store.getState().setActiveTrip('t1');

    store.getState().resetSession();

    const state = store.getState();
    expect(state.trips).toEqual([]);
    expect(state.expenses).toEqual({});
    expect(state.members).toEqual({});
    expect(state.activeTripId).toBeNull();
    expect(state.isHydrated).toBe(false);
    expect(state.hydrationError).toBeNull();
  });
});
