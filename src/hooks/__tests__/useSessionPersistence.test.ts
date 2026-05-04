/**
 * Tests for the useSessionPersistence contract.
 *
 * useSessionPersistence is a thin read-only wrapper over three Zustand store
 * selectors, so its behaviour is fully covered by testing the store's hydration
 * lifecycle directly — no React renderer or renderHook required.
 *
 * Each test mirrors what a component using the hook would observe.
 */

import { InMemoryStorageService } from '../../__mocks__/InMemoryStorageService';
import { createTripSessionStore } from '../../store/tripSessionStore';
import type { TripSessionStoreApi } from '../../store/tripSessionStore';
import { err, ok } from '../../core/types/Result';
import type { IStorageService } from '../../core/interfaces/IStorageService';
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
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStore(storage?: IStorageService): TripSessionStoreApi {
  return createTripSessionStore(storage ?? new InMemoryStorageService());
}

function failingStorage(message = 'network error'): IStorageService {
  const base = new InMemoryStorageService();
  return {
    ...base,
    getTripsForUser: async () => err({ kind: 'NetworkError', message }),
  };
}

// ---------------------------------------------------------------------------
// isHydrated lifecycle
// ---------------------------------------------------------------------------

describe('isHydrated lifecycle', () => {
  it('is false before any loadTrips call — store is not yet hydrated', () => {
    const store = makeStore();
    // Hook would return: { isHydrated: false, hydrationError: null }
    expect(store.getState().isHydrated).toBe(false);
    expect(store.getState().hydrationError).toBeNull();
  });

  it('flips to true after a successful loadTrips', async () => {
    const storage = new InMemoryStorageService();
    storage.seed({ trips: [trip], members: [member] });
    const store = makeStore(storage);

    expect(store.getState().isHydrated).toBe(false);

    await store.getState().loadTrips('u1');

    // Hook would now return: { isHydrated: true, hydrationError: null }
    expect(store.getState().isHydrated).toBe(true);
    expect(store.getState().hydrationError).toBeNull();
  });

  it('flips to true even when loadTrips resolves with a storage error', async () => {
    const store = makeStore(failingStorage('timeout'));

    await store.getState().loadTrips('u1');

    // isHydrated must be true so screens don't stay in a permanent loading state
    // Hook would return: { isHydrated: true, hydrationError: { kind: 'NetworkError', ... } }
    expect(store.getState().isHydrated).toBe(true);
    expect(store.getState().hydrationError).toEqual({
      kind: 'NetworkError',
      message: 'timeout',
    });
  });

  it('clears hydrationError on a subsequent successful loadTrips', async () => {
    const storage = new InMemoryStorageService();
    storage.seed({ trips: [trip] });

    let fail = true;
    const conditionalStorage: IStorageService = {
      ...storage,
      getTripsForUser: async (userId) => {
        if (fail) return err({ kind: 'NetworkError', message: 'offline' });
        return storage.getTripsForUser(userId);
      },
    };

    const store = makeStore(conditionalStorage);

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
    const storage = new InMemoryStorageService();
    storage.seed({ trips: [trip] });
    const store = makeStore(storage);

    await store.getState().loadTrips('u1');
    expect(store.getState().isHydrated).toBe(true);

    store.getState().resetSession();

    // Hook would return: { isHydrated: false, hydrationError: null }
    expect(store.getState().isHydrated).toBe(false);
    expect(store.getState().hydrationError).toBeNull();
  });

  it('also clears trips, expenses, and members from the cache', async () => {
    const storage = new InMemoryStorageService();
    storage.seed({ trips: [trip], members: [member] });
    const store = makeStore(storage);

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
    const store = makeStore(failingStorage('connection refused'));
    await store.getState().loadTrips('u1');
    const error = store.getState().hydrationError;
    expect(error?.kind).toBe('NetworkError');
  });

  it('is null after resetSession regardless of previous error', async () => {
    const store = makeStore(failingStorage());
    await store.getState().loadTrips('u1');
    expect(store.getState().hydrationError).not.toBeNull();

    store.getState().resetSession();
    expect(store.getState().hydrationError).toBeNull();
  });

  it('is null when Zod drops invalid trips but load succeeds overall', async () => {
    const storage = new InMemoryStorageService();
    const mixedStorage: IStorageService = {
      ...storage,
      getTripsForUser: async () =>
        ok([trip, { id: null, name: 'broken' } as unknown as Trip]),
    };
    const store = makeStore(mixedStorage);
    await store.getState().loadTrips('u1');

    // hydrationError stays null — Zod drops the bad item silently
    expect(store.getState().hydrationError).toBeNull();
    expect(store.getState().trips).toHaveLength(1);
  });
});
