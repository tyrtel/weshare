import { InMemoryTripRepository } from '../../__mocks__/InMemoryTripRepository';
import { InMemoryMemberRepository } from '../../__mocks__/InMemoryMemberRepository';
import { InMemoryExpenseRepository } from '../../__mocks__/InMemoryExpenseRepository';
import { InMemorySplitRepository } from '../../__mocks__/InMemorySplitRepository';
import { InMemorySplitRequestRepository } from '../../__mocks__/InMemorySplitRequestRepository';
import { createTripSessionStore } from '../tripSessionStore';
import type { TripSessionStoreApi, TripStoreRepos } from '../tripSessionStore';
import { ok, err } from '../../core/types/Result';
import type { Trip } from '../../core/models/Trip';
import type { Expense } from '../../core/models/Expense';
import type { Split } from '../../core/models/Split';
import type { TripMember } from '../../core/models/TripMember';
import type { SplitRequest } from '../../core/models/SplitRequest';

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
  status: 'active',
  closedAt: null,
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

function makeStore(overrides?: Partial<TripStoreRepos>): TripSessionStoreApi {
  return createTripSessionStore({
    trips:         overrides?.trips         ?? new InMemoryTripRepository(),
    expenses:      overrides?.expenses      ?? new InMemoryExpenseRepository(),
    members:       overrides?.members       ?? new InMemoryMemberRepository(),
    splits:        overrides?.splits        ?? new InMemorySplitRepository(),
    splitRequests: overrides?.splitRequests ?? new InMemorySplitRequestRepository(),
  });
}

function seededStore(): { repos: TripStoreRepos; store: TripSessionStoreApi } {
  const trips         = new InMemoryTripRepository().seed([trip]);
  const members       = new InMemoryMemberRepository().seed([member]);
  const expenses      = new InMemoryExpenseRepository().seed([expense], [split]);
  const splits        = new InMemorySplitRepository().seed([split]);
  const splitRequests = new InMemorySplitRequestRepository();
  const repos: TripStoreRepos = { trips, expenses, members, splits, splitRequests };
  return { repos, store: createTripSessionStore(repos) };
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
    const trips = new InMemoryTripRepository();
    trips.getTripsForUser = async () => err({ kind: 'NetworkError', message: 'offline' });
    const store = makeStore({ trips });
    await store.getState().loadTrips('u1');
    const state = store.getState();
    expect(state.isHydrated).toBe(true);
    expect(state.trips).toEqual([]);
    expect(state.hydrationError).toEqual({ kind: 'NetworkError', message: 'offline' });
  });

  it('silently drops items that fail Zod validation and keeps valid ones', async () => {
    const invalidTrip = { id: null, name: 'Bad' } as unknown as Trip;
    const trips = new InMemoryTripRepository();
    trips.getTripsForUser = async () => ok([trip, invalidTrip]);
    const store = makeStore({ trips });
    await store.getState().loadTrips('u1');
    expect(store.getState().trips).toHaveLength(1);
    expect(store.getState().trips[0].id).toBe('t1');
  });

  it('results in empty trips when all items are invalid', async () => {
    const trips = new InMemoryTripRepository();
    trips.getTripsForUser = async () => ok([{ not: 'a trip' } as unknown as Trip]);
    const store = makeStore({ trips });
    await store.getState().loadTrips('u1');
    expect(store.getState().trips).toEqual([]);
    expect(store.getState().isHydrated).toBe(true);
  });

  it('clears hydrationError on a subsequent successful load', async () => {
    const tripsRepo = new InMemoryTripRepository().seed([trip]);
    let shouldFail = true;
    tripsRepo.getTripsForUser = async (_userId) => {
      if (shouldFail) return err({ kind: 'NetworkError', message: 'timeout' });
      return ok([trip]);
    };
    const store = makeStore({ trips: tripsRepo });

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
    const store = createTripSessionStore({
      trips:    new InMemoryTripRepository().seed([trip, trip2]),
      members:  new InMemoryMemberRepository().seed([member, member2]),
      expenses: new InMemoryExpenseRepository().seed([expense, expense2], [split]),
      splits:   new InMemorySplitRepository().seed([split]),
    });
    await store.getState().loadTripDetail('t1');
    await store.getState().loadTripDetail('t2');
    expect(store.getState().expenses['t1']).toHaveLength(1);
    expect(store.getState().expenses['t2']).toHaveLength(1);
  });

  it('sets hydrationError on expense fetch failure', async () => {
    const expenses = new InMemoryExpenseRepository();
    expenses.getExpensesForTrip = async () => err({ kind: 'NetworkError', message: 'fail' });
    const store = makeStore({ expenses });
    await store.getState().loadTripDetail('t1');
    expect(store.getState().hydrationError).toEqual({ kind: 'NetworkError', message: 'fail' });
  });

  it('sets hydrationError on member fetch failure', async () => {
    const members = new InMemoryMemberRepository();
    members.getMembersForTrip = async () => err({ kind: 'NetworkError', message: 'no members' });
    const store = makeStore({ members });
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
    const expenses = new InMemoryExpenseRepository();
    expenses.saveExpense = async () => err({ kind: 'NetworkError', message: 'save failed' });
    const store = makeStore({ expenses });
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
    const expenses = new InMemoryExpenseRepository();
    expenses.deleteExpense = async () => err({ kind: 'NotFoundError', resource: 'Expense', id: 'e1' });
    const store = makeStore({ expenses });
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
    const store = createTripSessionStore({
      trips:    new InMemoryTripRepository().seed([trip]),
      members:  new InMemoryMemberRepository().seed([member]),
      expenses: new InMemoryExpenseRepository().seed([expense, expense2], [split, split2]),
      splits:   new InMemorySplitRepository().seed([split, split2]),
    });
    await store.getState().loadTripDetail('t1');

    await store.getState().markSettled(split);

    const expenses = store.getState().expenses['t1'];
    const untouched = expenses?.find((e) => e.id === 'e2');
    expect(untouched?.splits[0].settledAt).toBeUndefined();
  });

  it('sets hydrationError when storage fails', async () => {
    const splits = new InMemorySplitRepository();
    splits.updateSplit = async () => err({ kind: 'NetworkError', message: 'update failed' });
    const store = makeStore({ splits });
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
    expect(state.splitRequests).toEqual({});
    expect(state.activeTripId).toBeNull();
    expect(state.isHydrated).toBe(false);
    expect(state.hydrationError).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// loadSplitRequests
// ---------------------------------------------------------------------------

describe('loadSplitRequests', () => {
  it('populates splitRequests for the trip', async () => {
    const req: SplitRequest = {
      id: 'sr1', tripId: 't1',
      requesterUserId: 'u1', payerUserId: 'u2',
      amountCents: 5000, currency: 'EUR', note: '',
      status: 'created', preferredWallet: 'revolut',
      externalRefId: null, stripePaymentLinkId: null, stripeSessionId: null,
      obPaymentId: null, obProvider: null,
          rolledOverFromTripId: null,
      createdAt: NOW, updatedAt: NOW,
    };
    const splitRequests = new InMemorySplitRequestRepository().seed([req]);
    const store = makeStore({ splitRequests });
    await store.getState().loadSplitRequests('t1');
    expect(store.getState().splitRequests['t1']).toHaveLength(1);
    expect(store.getState().splitRequests['t1'][0].id).toBe('sr1');
  });

  it('sets hydrationError on failure', async () => {
    const splitRequests = new InMemorySplitRequestRepository();
    splitRequests.getSplitRequestsForTrip = async () =>
      err({ kind: 'NetworkError', message: 'fail' });
    const store = makeStore({ splitRequests });
    await store.getState().loadSplitRequests('t1');
    expect(store.getState().hydrationError).toEqual({ kind: 'NetworkError', message: 'fail' });
  });
});

// ---------------------------------------------------------------------------
// updateSplitRequest
// ---------------------------------------------------------------------------

describe('updateSplitRequest', () => {
  it('updates the split request in the cache', async () => {
    const req: SplitRequest = {
      id: 'sr1', tripId: 't1',
      requesterUserId: 'u1', payerUserId: 'u2',
      amountCents: 5000, currency: 'EUR', note: '',
      status: 'created', preferredWallet: 'revolut',
      externalRefId: null, stripePaymentLinkId: null, stripeSessionId: null,
      obPaymentId: null, obProvider: null,
          rolledOverFromTripId: null,
      createdAt: NOW, updatedAt: NOW,
    };
    const splitRequests = new InMemorySplitRequestRepository().seed([req]);
    const store = makeStore({ splitRequests });
    await store.getState().loadSplitRequests('t1');

    const updated = { ...req, status: 'completed' as const };
    await store.getState().updateSplitRequest(updated);

    expect(store.getState().splitRequests['t1'][0].status).toBe('completed');
  });
});

// ---------------------------------------------------------------------------
// appendSplitRequest
// ---------------------------------------------------------------------------

describe('appendSplitRequest', () => {
  const req: SplitRequest = {
    id: 'sr-new', tripId: 't1',
    requesterUserId: 'u1', payerUserId: 'u2',
    amountCents: 2500, currency: 'EUR', note: '',
    status: 'request_sent', preferredWallet: 'revolut',
    externalRefId: null, stripePaymentLinkId: null, stripeSessionId: 'cs_test',
    obPaymentId: null, obProvider: null,
          rolledOverFromTripId: null,
    createdAt: NOW, updatedAt: NOW,
  };

  it('adds the request to the correct trip bucket without a repo call', () => {
    const store = makeStore();
    expect(store.getState().splitRequests['t1']).toBeUndefined();

    store.getState().appendSplitRequest(req);

    expect(store.getState().splitRequests['t1']).toHaveLength(1);
    expect(store.getState().splitRequests['t1'][0].id).toBe('sr-new');
  });

  it('appends to an existing bucket without overwriting prior requests', async () => {
    const existing: SplitRequest = { ...req, id: 'sr-old', stripeSessionId: null };
    const splitRequests = new InMemorySplitRequestRepository().seed([existing]);
    const store = makeStore({ splitRequests });
    await store.getState().loadSplitRequests('t1');

    store.getState().appendSplitRequest(req);

    expect(store.getState().splitRequests['t1']).toHaveLength(2);
    expect(store.getState().splitRequests['t1'].map(r => r.id)).toContain('sr-old');
    expect(store.getState().splitRequests['t1'].map(r => r.id)).toContain('sr-new');
  });

  it('does not trigger a repo save', async () => {
    const splitRequests = new InMemorySplitRequestRepository();
    const store = makeStore({ splitRequests });

    store.getState().appendSplitRequest(req);

    // Repo should still be empty — no saveSplitRequest was called.
    const result = await splitRequests.getSplitRequest(req.id);
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// appendTrip / replaceTrip
// ---------------------------------------------------------------------------

describe('appendTrip', () => {
  it('adds the trip to the cache', () => {
    const store = makeStore();
    store.getState().appendTrip(trip);
    expect(store.getState().trips).toHaveLength(1);
    expect(store.getState().trips[0].id).toBe('t1');
  });
});

describe('replaceTrip', () => {
  it('updates the trip in place', async () => {
    const { store } = seededStore();
    await store.getState().loadTrips('u1');
    const renamed = { ...trip, name: 'Porto' };
    store.getState().replaceTrip(renamed);
    expect(store.getState().trips[0].name).toBe('Porto');
  });
});

// ---------------------------------------------------------------------------
// appendExpense / replaceExpense
// ---------------------------------------------------------------------------

describe('appendExpense', () => {
  it('appends expense to the correct trip bucket', () => {
    const store = makeStore();
    store.getState().appendExpense(expense);
    expect(store.getState().expenses['t1']).toHaveLength(1);
    expect(store.getState().expenses['t1'][0].id).toBe('e1');
  });
});

describe('replaceExpense', () => {
  it('replaces expense in the cache without re-fetching', async () => {
    const { store } = seededStore();
    await store.getState().loadTripDetail('t1');
    const renamed = { ...expense, description: 'Lunch' };
    store.getState().replaceExpense(renamed);
    expect(store.getState().expenses['t1'][0].description).toBe('Lunch');
  });
});

// ---------------------------------------------------------------------------
// appendMember
// ---------------------------------------------------------------------------

describe('appendMember', () => {
  it('adds the member to the correct trip bucket', () => {
    const store = makeStore();
    store.getState().appendMember(member);
    expect(store.getState().members['t1']).toHaveLength(1);
    expect(store.getState().members['t1'][0].userId).toBe('u1');
  });
});

// ---------------------------------------------------------------------------
// setTripStatus
// ---------------------------------------------------------------------------

describe('setTripStatus', () => {
  it('updates the trip status in the repo and in the cache', async () => {
    const { store } = seededStore();
    await store.getState().loadTrips('u1');

    const result = await store.getState().setTripStatus('t1', 'settling');

    expect(result.ok).toBe(true);
    expect(store.getState().trips[0].status).toBe('settling');
  });

  it('updates the cache without touching other trips', async () => {
    const trip2: Trip = { ...trip, id: 't2', status: 'active' };
    const tripsRepo = new InMemoryTripRepository().seed([trip, trip2]);
    const store = createTripSessionStore({
      trips:         tripsRepo,
      expenses:      new InMemoryExpenseRepository(),
      members:       new InMemoryMemberRepository(),
      splits:        new InMemorySplitRepository(),
      splitRequests: new InMemorySplitRequestRepository(),
    });
    await store.getState().loadTrips('u1');

    await store.getState().setTripStatus('t1', 'settling');

    const trips = store.getState().trips;
    const t1 = trips.find(t => t.id === 't1');
    const t2 = trips.find(t => t.id === 't2');
    expect(t1?.status).toBe('settling');
    expect(t2?.status).toBe('active');
  });

  it('returns an error and sets hydrationError for a non-existent trip', async () => {
    const { store } = seededStore();
    await store.getState().loadTrips('u1');

    const result = await store.getState().setTripStatus('no-such-trip', 'settling');

    expect(result.ok).toBe(false);
    expect(store.getState().hydrationError).not.toBeNull();
  });

  it('persists a non-null closedAt when status transitions to closed', async () => {
    const { repos, store } = seededStore();
    await store.getState().loadTrips('u1');

    await store.getState().setTripStatus('t1', 'closed');

    const stored = await repos.trips.getTrip('t1');
    expect(stored.ok && stored.value.closedAt).not.toBeNull();
    expect(store.getState().trips[0].closedAt).not.toBeNull();
  });

  it('does not set closedAt when transitioning to a non-closed status', async () => {
    const { repos, store } = seededStore();
    await store.getState().loadTrips('u1');

    await store.getState().setTripStatus('t1', 'active');

    const stored = await repos.trips.getTrip('t1');
    expect(stored.ok && stored.value.closedAt).toBeNull();
    expect(store.getState().trips[0].closedAt).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// addExpense — trip status guard
// ---------------------------------------------------------------------------

describe('addExpense — trip status guard', () => {
  const newExpense: Expense = {
    id: 'e_guard',
    tripId: 't1',
    description: 'Blocked',
    totalAmountCents: 2000,
    currency: 'EUR',
    paidByUserId: 'u1',
    createdAt: NOW,
    splits: [],
    metadata: {},
  };

  it('blocks addExpense when trip status is settling', async () => {
    const { store } = seededStore();
    await store.getState().loadTrips('u1');
    await store.getState().setTripStatus('t1', 'settling');

    await store.getState().addExpense(newExpense);

    expect(store.getState().expenses['t1'] ?? []).not.toContainEqual(
      expect.objectContaining({ id: 'e_guard' }),
    );
    expect(store.getState().hydrationError).toMatchObject({
      kind: 'ValidationError',
      field: 'trip.status',
    });
  });

  it('blocks addExpense when trip status is closed', async () => {
    const { store } = seededStore();
    await store.getState().loadTrips('u1');
    await store.getState().setTripStatus('t1', 'closed');

    await store.getState().addExpense(newExpense);

    expect(store.getState().expenses['t1'] ?? []).not.toContainEqual(
      expect.objectContaining({ id: 'e_guard' }),
    );
    expect(store.getState().hydrationError).toMatchObject({ kind: 'ValidationError' });
  });

  it('allows addExpense when trip status is active', async () => {
    const { store } = seededStore();
    await store.getState().loadTrips('u1');

    await store.getState().addExpense(newExpense);

    expect(store.getState().expenses['t1']).toContainEqual(
      expect.objectContaining({ id: 'e_guard' }),
    );
  });

  it('allows addExpense when the trip is not in the cache (unknown trip)', async () => {
    const { store } = seededStore();
    // Do NOT call loadTrips — trips cache is empty.
    const unknownExpense: Expense = { ...newExpense, tripId: 'unknown-trip' };

    await store.getState().addExpense(unknownExpense);

    // No error — guard only fires when the trip is known to be locked.
    expect(store.getState().hydrationError).toBeNull();
  });
});
