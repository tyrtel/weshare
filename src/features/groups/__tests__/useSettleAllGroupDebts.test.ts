import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { useSettleAllGroupDebts } from '../hooks/useSettleAllGroupDebts';
import { ServiceContext } from '../../../core/di/ServiceContext';
import { createTestContainer } from '../../../core/di/testContainer';
import { SPLIT_REQUEST_REPO, TRIP_STORE } from '../../../core/di/tokens';
import { InMemorySplitRequestRepository } from '../../../__mocks__/InMemorySplitRequestRepository';
import { err } from '../../../core/types/Result';
import { groupFactory, tripFactory } from '../../../__testUtils__/factories';
import type { Settlement } from '../../../core/models/Settlement';
import type { ServiceContainer } from '../../../core/di/ServiceContainer';

function makeWrapper(container: ServiceContainer) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(ServiceContext.Provider, { value: container }, children);
  };
}

const GROUP_ID = 'g1';

const SETTLEMENTS: Settlement[] = [
  { fromUserId: 'u2', toUserId: 'u1', amountCents: 1000, currency: 'EUR' },
  { fromUserId: 'u3', toUserId: 'u1', amountCents: 500,  currency: 'EUR' },
];

// settleAll returns at once (save-first); this lets the store's background saves land.
async function settle() {
  await act(async () => { await new Promise(r => setTimeout(r, 0)); });
}

describe('useSettleAllGroupDebts', () => {
  let container: ServiceContainer;

  beforeEach(() => {
    container = createTestContainer();
    const store = container.resolve(TRIP_STORE).getState();
    store.appendGroup(groupFactory({ id: GROUP_ID, members: [] }));
  });

  it('records a completed group-scoped payment for every settlement', async () => {
    const { result } = renderHook(() => useSettleAllGroupDebts(GROUP_ID, SETTLEMENTS), { wrapper: makeWrapper(container) });

    act(() => { result.current.settleAll(); });
    await settle();

    const stored = await container.resolve(SPLIT_REQUEST_REPO).getSplitRequestsForGroup(GROUP_ID);
    expect(stored.ok).toBe(true);
    if (!stored.ok) return;
    expect(stored.value).toHaveLength(2);
    expect(stored.value.every(r => r.status === 'paid' && r.groupId === GROUP_ID && r.tripId === undefined)).toBe(true);
    expect(stored.value.find(r => r.payerUserId === 'u2')?.amountCents).toBe(1000);
    expect(stored.value.find(r => r.payerUserId === 'u3')?.amountCents).toBe(500);
  });

  it('shows the payments in the cache before the server answers', () => {
    const { result } = renderHook(() => useSettleAllGroupDebts(GROUP_ID, SETTLEMENTS), { wrapper: makeWrapper(container) });

    act(() => { result.current.settleAll(); });

    expect(container.resolve(TRIP_STORE).getState().groupSplitRequests[GROUP_ID]).toHaveLength(2);
  });

  // Phase 4c: settling debts no longer touches expenses or trips at all —
  // those are independent, purely organizational actions now.
  it('does not settle any expense or close any trip', async () => {
    const trip = tripFactory({ id: 't1', groupId: GROUP_ID, status: 'active' });
    container.resolve(TRIP_STORE).getState().appendTrip(trip);

    const { result } = renderHook(() => useSettleAllGroupDebts(GROUP_ID, SETTLEMENTS), { wrapper: makeWrapper(container) });
    act(() => { result.current.settleAll(); });
    await settle();

    const storeTrip = container.resolve(TRIP_STORE).getState().trips.find(t => t.id === 't1');
    expect(storeTrip?.status).toBe('active');
  });

  it('records nothing when there are no outstanding settlements', async () => {
    const { result } = renderHook(() => useSettleAllGroupDebts(GROUP_ID, []), { wrapper: makeWrapper(container) });

    act(() => { result.current.settleAll(); });
    await settle();

    const stored = await container.resolve(SPLIT_REQUEST_REPO).getSplitRequestsForGroup(GROUP_ID);
    expect(stored.ok && stored.value).toHaveLength(0);
  });

  it('undoes only the payment the server refused, and sets writeError', async () => {
    const repo = container.resolve(SPLIT_REQUEST_REPO) as InMemorySplitRequestRepository;
    const original = repo.saveSplitRequest;
    repo.saveSplitRequest = async (req) => {
      if (req.payerUserId === 'u2') {
        return err({ kind: 'NetworkError', message: 'network failure' });
      }
      return original.call(repo, req);
    };

    const { result } = renderHook(() => useSettleAllGroupDebts(GROUP_ID, SETTLEMENTS), { wrapper: makeWrapper(container) });
    act(() => { result.current.settleAll(); });
    await settle();

    const state = container.resolve(TRIP_STORE).getState();
    expect(state.writeError).toMatchObject({ kind: 'NetworkError' });
    expect(state.groupSplitRequests[GROUP_ID].map(r => r.payerUserId)).toEqual(['u3']);
  });

  it('sets a NetworkError writeError when the repo call throws', async () => {
    const repo = container.resolve(SPLIT_REQUEST_REPO) as InMemorySplitRequestRepository;
    repo.saveSplitRequest = async () => { throw new Error('connection reset'); };

    const { result } = renderHook(() => useSettleAllGroupDebts(GROUP_ID, SETTLEMENTS), { wrapper: makeWrapper(container) });
    act(() => { result.current.settleAll(); });
    await settle();

    expect(container.resolve(TRIP_STORE).getState().writeError).toEqual({ kind: 'NetworkError', message: 'connection reset' });
  });
});
