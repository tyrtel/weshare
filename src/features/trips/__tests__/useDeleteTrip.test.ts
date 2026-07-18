import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { useDeleteTrip } from '../hooks/useDeleteTrip';
import { ServiceContext } from '../../../core/di/ServiceContext';
import { createTestContainer } from '../../../core/di/testContainer';
import { TRIP_REPO, TRIP_STORE } from '../../../core/di/tokens';
import { InMemoryTripRepository } from '../../../__mocks__/InMemoryTripRepository';
import { tripFactory } from '../../../__testUtils__/factories';
import type { ServiceContainer } from '../../../core/di/ServiceContainer';

function makeWrapper(container: ServiceContainer) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(ServiceContext.Provider, { value: container }, children);
  };
}

describe('useDeleteTrip', () => {
  let container: ServiceContainer;
  let tripRepo: InMemoryTripRepository;

  const trip = tripFactory({ id: 't1' });

  beforeEach(() => {
    tripRepo = new InMemoryTripRepository();
    tripRepo.seed([trip]);
    container = createTestContainer({ tripRepo });
    container.resolve(TRIP_STORE).getState().appendTrip(trip);
  });

  it('deletes the trip and returns true', async () => {
    const { result } = renderHook(() => useDeleteTrip(), { wrapper: makeWrapper(container) });

    let ok = false;
    await act(async () => { ok = await result.current.deleteTrip('t1'); });

    expect(ok).toBe(true);
    const stored = await container.resolve(TRIP_REPO).getTrip('t1');
    expect(stored.ok).toBe(false);
  });

  it('removes the trip and its cached expenses/members/split requests from the store', async () => {
    const storeApi = container.resolve(TRIP_STORE);
    storeApi.setState({
      expenses: { t1: [] },
      members: { t1: [] },
      splitRequests: { t1: [] },
    });

    const { result } = renderHook(() => useDeleteTrip(), { wrapper: makeWrapper(container) });

    await act(async () => { await result.current.deleteTrip('t1'); });

    const state = storeApi.getState();
    expect(state.trips.find(t => t.id === 't1')).toBeUndefined();
    expect(state.expenses.t1).toBeUndefined();
    expect(state.members.t1).toBeUndefined();
    expect(state.splitRequests.t1).toBeUndefined();
  });

  it('returns false for a missing trip id', async () => {
    const { result } = renderHook(() => useDeleteTrip(), { wrapper: makeWrapper(container) });

    let ok = true;
    await act(async () => { ok = await result.current.deleteTrip('nonexistent'); });

    expect(ok).toBe(false);
  });

  it('loading is false initially', () => {
    const { result } = renderHook(() => useDeleteTrip(), { wrapper: makeWrapper(container) });
    expect(result.current.loading).toBe(false);
  });
});
