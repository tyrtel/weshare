/**
 * Tests for the useSessionPersistence contract.
 *
 * useSessionPersistence is a thin read-only wrapper over three Zustand store
 * selectors, so its behaviour is fully covered by testing the store's hydration
 * lifecycle directly — no React renderer or renderHook required.
 *
 * Each test mirrors what a component using the hook would observe.
 */

import { InMemoryTripRepository } from '../../__mocks__/InMemoryTripRepository';
import { InMemoryMemberRepository } from '../../__mocks__/InMemoryMemberRepository';
import { InMemoryExpenseRepository } from '../../__mocks__/InMemoryExpenseRepository';
import { InMemorySplitRepository } from '../../__mocks__/InMemorySplitRepository';
import { InMemorySplitRequestRepository } from '../../__mocks__/InMemorySplitRequestRepository';
import { createTripSessionStore } from '../../store/tripSessionStore';
import type { TripSessionStoreApi, TripStoreRepos } from '../../store/tripSessionStore';
import { err, ok } from '../../core/types/Result';
import type { Trip } from '../../core/models/Trip';
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
  status: 'active' as const,
  closedAt: null,
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

function failingStore(message = 'network error'): TripSessionStoreApi {
  const trips = new InMemoryTripRepository();
  trips.getTripsForUser = async () => err({ kind: 'NetworkError', message });
  return makeStore({ trips });
}

// ---------------------------------------------------------------------------
// isHydrated lifecycle
// ---------------------------------------------------------------------------

describe('isHydrated lifecycle', () => {
  it('is false before any loadTrips call — store is not yet hydrated', () => {
    const store = makeStore();
    expect(store.getState().isHydrated).toBe(false);
    expect(store.getState().hydrationError).toBeNull();
  });

  it('flips to true after a successful loadTrips', async () => {
    const trips = new InMemoryTripRepository().seed([trip]);
    const members = new InMemoryMemberRepository().seed([member]);
    const store = makeStore({ trips, members });

    expect(store.getState().isHydrated).toBe(false);

    await store.getState().loadTrips('u1');

    expect(store.getState().isHydrated).toBe(true);
    expect(store.getState().hydrationError).toBeNull();
  });

  it('flips to true even when loadTrips resolves with a storage error', async () => {
    const store = failingStore('timeout');

    await store.getState().loadTrips('u1');

    expect(store.getState().isHydrated).toBe(true);
    expect(store.getState().hydrationError).toEqual({
      kind: 'NetworkError',
      message: 'timeout',
    });
  });

  it('clears hydrationError on a subsequent successful loadTrips', async () => {
    const trips = new InMemoryTripRepository().seed([trip]);
    let fail = true;
    trips.getTripsForUser = async (_userId) => {
      if (fail) return err({ kind: 'NetworkError', message: 'offline' });
      return ok([trip]);
    };

    const store = makeStore({ trips });

    await store.getState().loadTrips('u1');
    expect(store.getState().hydrationError).not.toBeNull();

    fail = false;
    await store.getState().loadTrips('u1');

    expect(store.getState().hydrationError).toBeNull();
    expect(store.getState().trips).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// resetSession
// ---------------------------------------------------------------------------

describe('resetSession', () => {
  it('resets isHydrated to false — screens re-enter loading state', async () => {
    const trips = new InMemoryTripRepository().seed([trip]);
    const store = makeStore({ trips });

    await store.getState().loadTrips('u1');
    expect(store.getState().isHydrated).toBe(true);

    store.getState().resetSession();

    expect(store.getState().isHydrated).toBe(false);
    expect(store.getState().hydrationError).toBeNull();
  });

  it('also clears trips, expenses, and members from the cache', async () => {
    const trips = new InMemoryTripRepository().seed([trip]);
    const members = new InMemoryMemberRepository().seed([member]);
    const store = makeStore({ trips, members });

    await store.getState().loadTrips('u1');
    store.getState().resetSession();

    expect(store.getState().trips).toEqual([]);
    expect(store.getState().expenses).toEqual({});
    expect(store.getState().members).toEqual({});
  });

  it('does not throw when called before any loadTrips', () => {
    const store = makeStore();
    expect(() => store.getState().resetSession()).not.toThrow();
    expect(store.getState().isHydrated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// hydrationError contract
// ---------------------------------------------------------------------------

describe('hydrationError', () => {
  it('is null on a clean initial store', () => {
    expect(makeStore().getState().hydrationError).toBeNull();
  });

  it('captures NetworkError from a failed loadTrips', async () => {
    const store = failingStore('connection refused');
    await store.getState().loadTrips('u1');
    const error = store.getState().hydrationError;
    expect(error?.kind).toBe('NetworkError');
  });

  it('is null after resetSession regardless of previous error', async () => {
    const store = failingStore();
    await store.getState().loadTrips('u1');
    expect(store.getState().hydrationError).not.toBeNull();

    store.getState().resetSession();
    expect(store.getState().hydrationError).toBeNull();
  });

  it('is null when Zod drops invalid trips but load succeeds overall', async () => {
    const trips = new InMemoryTripRepository();
    trips.getTripsForUser = async () =>
      ok([trip, { id: null, name: 'broken' } as unknown as Trip]);
    const store = makeStore({ trips });
    await store.getState().loadTrips('u1');

    expect(store.getState().hydrationError).toBeNull();
    expect(store.getState().trips).toHaveLength(1);
  });
});
