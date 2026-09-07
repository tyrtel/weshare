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

describe('useSettleAllGroupDebts', () => {
  let container: ServiceContainer;

  beforeEach(() => {
    container = createTestContainer();
    const store = container.resolve(TRIP_STORE).getState();
    store.appendGroup(groupFactory({ id: GROUP_ID, members: [] }));
  });

  it('returns true and records a completed group-scoped payment for every settlement', async () => {
    const { result } = renderHook(() => useSettleAllGroupDebts(GROUP_ID, SETTLEMENTS), { wrapper: makeWrapper(container) });

    let ok = false;
    await act(async () => { ok = await result.current.settleAll(); });

    expect(ok).toBe(true);
    expect(result.current.error).toBeNull();

    const stored = await container.resolve(SPLIT_REQUEST_REPO).getSplitRequestsForGroup(GROUP_ID);
    expect(stored.ok).toBe(true);
    if (!stored.ok) return;
    expect(stored.value).toHaveLength(2);
    expect(stored.value.every(r => r.status === 'paid' && r.groupId === GROUP_ID && r.tripId === undefined)).toBe(true);
    expect(stored.value.find(r => r.payerUserId === 'u2')?.amountCents).toBe(1000);
    expect(stored.value.find(r => r.payerUserId === 'u3')?.amountCents).toBe(500);
  });

  // Phase 4c: settling debts no longer touches expenses or trips at all —
  // those are independent, purely organizational actions now.
  it('does not settle any expense or close any trip', async () => {
    const trip = tripFactory({ id: 't1', groupId: GROUP_ID, status: 'active' });
    container.resolve(TRIP_STORE).getState().appendTrip(trip);

    const { result } = renderHook(() => useSettleAllGroupDebts(GROUP_ID, SETTLEMENTS), { wrapper: makeWrapper(container) });
    await act(async () => { await result.current.settleAll(); });

    const storeTrip = container.resolve(TRIP_STORE).getState().trips.find(t => t.id === 't1');
    expect(storeTrip?.status).toBe('active');
  });

  it('records nothing and returns true when there are no outstanding settlements', async () => {
    const { result } = renderHook(() => useSettleAllGroupDebts(GROUP_ID, []), { wrapper: makeWrapper(container) });

    let ok = false;
    await act(async () => { ok = await result.current.settleAll(); });

    expect(ok).toBe(true);
    const stored = await container.resolve(SPLIT_REQUEST_REPO).getSplitRequestsForGroup(GROUP_ID);
    expect(stored.ok && stored.value).toHaveLength(0);
  });

  it('surfaces a repo failure via error and returns false', async () => {
    const repo = container.resolve(SPLIT_REQUEST_REPO) as InMemorySplitRequestRepository;
    const original = repo.saveSplitRequest;
    repo.saveSplitRequest = async (req) => {
      if (req.payerUserId === 'u2') {
        return err({ kind: 'NetworkError', message: 'network failure' });
      }
      return original.call(repo, req);
    };

    const { result } = renderHook(() => useSettleAllGroupDebts(GROUP_ID, SETTLEMENTS), { wrapper: makeWrapper(container) });

    let ok = true;
    await act(async () => { ok = await result.current.settleAll(); });

    expect(ok).toBe(false);
    expect(result.current.error).toMatchObject({ kind: 'NetworkError' });
  });

  // Regression coverage, same class of bug as useAddExpense/useEditExpense:
  // settleAll had no try/catch, so a thrown exception (distinct from a repo
  // returning Result.err) left `loading` stuck at true forever.
  it('resets loading and sets a NetworkError when the repo call throws, instead of hanging forever', async () => {
    const repo = container.resolve(SPLIT_REQUEST_REPO) as InMemorySplitRequestRepository;
    repo.saveSplitRequest = async () => { throw new Error('connection reset'); };

    const { result } = renderHook(() => useSettleAllGroupDebts(GROUP_ID, SETTLEMENTS), { wrapper: makeWrapper(container) });

    let ok = true;
    await act(async () => { ok = await result.current.settleAll(); });

    expect(ok).toBe(false);
    expect(result.current.loading).toBe(false);
    expect(result.current.error?.kind).toBe('NetworkError');
  });
});
