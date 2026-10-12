import { createTestContainer } from '../../core/di/testContainer';
import { TRIP_STORE } from '../../core/di/tokens';
import { InMemoryCacheStorage } from '../../__mocks__/InMemoryCacheStorage';
import { createCachePersistence, CACHE_SCHEMA_VERSION, MAX_CACHE_CHARS } from '../cachePersistence';
import {
  tripFactory, expenseFactory, memberFactory, groupFactory, splitRequestFactory, recurringExpenseFactory,
} from '../../__testUtils__/factories';
import type { TripSessionStoreApi } from '../tripSessionStore';

function setup() {
  const store   = createTestContainer().resolve(TRIP_STORE);
  const storage = new InMemoryCacheStorage();
  return { store, storage, persistence: createCachePersistence(store, storage) };
}

function seed(store: TripSessionStoreApi) {
  store.setState({
    trips:              [tripFactory({ id: 't1' })],
    expenses:           { t1: [expenseFactory({ id: 'e1', tripId: 't1' })] },
    members:            { t1: [memberFactory({ tripId: 't1' })] },
    splitRequests:      { t1: [splitRequestFactory({ id: 'r1', tripId: 't1' })] },
    groups:             [groupFactory({ id: 'g1' })],
    groupExpenses:      { g1: [expenseFactory({ id: 'ge1', tripId: undefined, groupId: 'g1' })] },
    recurringExpenses:  { g1: [recurringExpenseFactory({ id: 'rec1', groupId: 'g1' })] },
    fetchedAt:          { trips: 1234, 'trip:t1': 1234 },
  });
}

describe('cachePersistence', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  it('restores what was saved, with Dates revived and fetch times intact', async () => {
    const a = setup();
    const session = a.persistence.start('u1');
    seed(a.store);
    await session.flush();

    const b = setup();
    const restored = await createCachePersistence(b.store, a.storage).restore('u1');

    expect(restored).toBe(true);
    const s = b.store.getState();
    expect(s.isHydrated).toBe(true);
    expect(s.trips[0].createdAt).toBeInstanceOf(Date);
    expect(s.expenses['t1'][0].createdAt).toBeInstanceOf(Date);
    expect(s.members['t1'][0].joinedAt).toBeInstanceOf(Date);
    expect(s.splitRequests['t1'][0].updatedAt).toBeInstanceOf(Date);
    expect(s.groups[0].createdAt).toBeInstanceOf(Date);
    expect(s.groupExpenses['g1'][0].id).toBe('ge1');
    expect(s.recurringExpenses['g1'][0].nextDueAt).toBeInstanceOf(Date);
    expect(s.fetchedAt).toEqual({ trips: 1234, 'trip:t1': 1234 });
    session.stop();
  });

  it('debounces writes and only saves once changes settle', async () => {
    const { store, storage, persistence } = setup();
    const spy = jest.spyOn(storage, 'setItem');
    persistence.start('u1');

    seed(store);
    store.getState().appendTrip(tripFactory({ id: 't2' }));
    expect(spy).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1000);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('ignores store changes outside the persisted slices', async () => {
    const { store, storage, persistence } = setup();
    const spy = jest.spyOn(storage, 'setItem');
    persistence.start('u1');

    store.getState().setActiveTrip('t1');
    await jest.advanceTimersByTimeAsync(1000);
    expect(spy).not.toHaveBeenCalled();
  });

  it('does not restore another user\'s cache, and deletes it', async () => {
    const { store, storage, persistence } = setup();
    const session = persistence.start('u1');
    seed(store);
    await session.flush();

    const other = setup();
    expect(await createCachePersistence(other.store, storage).restore('u2')).toBe(false);
    expect(other.store.getState().trips).toEqual([]);
    expect(await storage.getItem('session')).toBeNull();
  });

  it('discards a cache written by a different schema version', async () => {
    const { store, storage, persistence } = setup();
    await storage.setItem('session', JSON.stringify({ version: CACHE_SCHEMA_VERSION + 1, userId: 'u1', state: {} }));
    expect(await persistence.restore('u1')).toBe(false);
    expect(store.getState().isHydrated).toBe(false);
  });

  it('discards an unreadable cache instead of throwing', async () => {
    const { storage, persistence } = setup();
    await storage.setItem('session', '{not json');
    expect(await persistence.restore('u1')).toBe(false);
    expect(await storage.getItem('session')).toBeNull();
  });

  it('leaves out optimistic expenses that have not been confirmed', async () => {
    const { store, storage, persistence } = setup();
    const session = persistence.start('u1');
    seed(store);
    store.setState({ pendingExpenseIds: ['e1'] });
    await session.flush();

    const saved = JSON.parse((await storage.getItem('session'))!);
    expect(saved.state.expenses.t1).toEqual([]);
  });

  it('stops saving after stop()', async () => {
    const { store, storage, persistence } = setup();
    const spy = jest.spyOn(storage, 'setItem');
    persistence.start('u1').stop();
    seed(store);
    await jest.advanceTimersByTimeAsync(1000);
    expect(spy).not.toHaveBeenCalled();
  });

  it('drops the saved cache rather than write one over the size limit', async () => {
    const { store, storage, persistence } = setup();
    await storage.setItem('session', 'old');
    const session = persistence.start('u1');
    store.setState({ trips: [tripFactory({ id: 't1', name: 'x'.repeat(MAX_CACHE_CHARS) })] });
    await session.flush();
    expect(await storage.getItem('session')).toBeNull();
  });
});
