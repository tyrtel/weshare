// Replace useFocusEffect with useEffect so the hook fires without navigation context.
jest.mock('expo-router', () => ({
  useFocusEffect: (cb: Parameters<typeof import('react').useEffect>[0]) => {
    const { useEffect } = require('react');
    useEffect(cb, [cb]);
  },
}));

import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { useTrips } from '../hooks/useTrips';
import { ServiceContext } from '../../../core/di/ServiceContext';
import { createTestContainer } from '../../../core/di/testContainer';
import { AUTH, TRIP_REPO } from '../../../core/di/tokens';
import { InMemoryTripRepository } from '../../../__mocks__/InMemoryTripRepository';
import { err } from '../../../core/types/Result';
import type { ServiceContainer } from '../../../core/di/ServiceContainer';
import type { Trip } from '../../../core/models/Trip';
import { tripFactory } from '../../../__testUtils__/factories';

function makeWrapper(container: ServiceContainer) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(ServiceContext.Provider, { value: container }, children);
  };
}

const NOW = new Date('2025-06-01T12:00:00Z');

// ── No user ───────────────────────────────────────────────────────────────────

describe('useTrips — no signed-in user', () => {
  it('returns empty trips list when no user is signed in', async () => {
    const container = createTestContainer();
    const { result } = renderHook(() => useTrips(), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.trips).toHaveLength(0);
    expect(result.current.error).toBeNull();
  });
});

// ── With user ─────────────────────────────────────────────────────────────────

describe('useTrips — signed-in user', () => {
  let container: ServiceContainer;
  let userId: string;

  beforeEach(async () => {
    container = createTestContainer();
    const auth = container.resolve(AUTH);
    const res  = await auth.signInAsGuest('Jay');
    userId = res.ok ? res.value.id : '';
  });

  it('returns trips owned by the current user', async () => {
    const storage = container.resolve(TRIP_REPO);
    await storage.saveTrip(tripFactory({ id: 't1', name: 'Trip t1', ownerId: userId, closedAt: null }));
    await storage.saveTrip(tripFactory({ id: 't2', name: 'Trip t2', ownerId: userId, closedAt: null }));

    const { result } = renderHook(() => useTrips(), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.trips).toHaveLength(2);
  });

  it('does not return trips owned by other users', async () => {
    const storage = container.resolve(TRIP_REPO);
    await storage.saveTrip(tripFactory({ id: 't1', name: 'Trip t1', ownerId: userId, closedAt: null }));
    await storage.saveTrip(tripFactory({ id: 't2', name: 'Trip t2', ownerId: 'someone_else', closedAt: null }));

    const { result } = renderHook(() => useTrips(), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.trips.every(t => t.ownerId === userId)).toBe(true);
  });

  it('starts with loading=true', () => {
    const { result } = renderHook(() => useTrips(), { wrapper: makeWrapper(container) });
    expect(result.current.loading).toBe(true);
  });

  it('loading becomes false after data resolves', async () => {
    const { result } = renderHook(() => useTrips(), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));
  });
});

// ── Refetch ───────────────────────────────────────────────────────────────────

describe('useTrips — refetch', () => {
  it('picks up newly created trips after refetch', async () => {
    const container = createTestContainer();
    const auth    = container.resolve(AUTH);
    const storage = container.resolve(TRIP_REPO);

    const res = await auth.signInAsGuest('Jay');
    const uid = res.ok ? res.value.id : '';

    const { result } = renderHook(() => useTrips(), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.trips).toHaveLength(0);

    await storage.saveTrip(tripFactory({ id: 't1', name: 'Trip t1', ownerId: uid, closedAt: null }));
    await act(async () => { await result.current.refetch(); });

    expect(result.current.trips).toHaveLength(1);
  });
});

// ── Sign out ──────────────────────────────────────────────────────────────────

describe('useTrips — sign out', () => {
  it('returns empty trips after signing out', async () => {
    const container = createTestContainer();
    const auth    = container.resolve(AUTH);
    const storage = container.resolve(TRIP_REPO);

    const res = await auth.signInAsGuest('Jay');
    const uid = res.ok ? res.value.id : '';
    await storage.saveTrip(tripFactory({ id: 't1', name: 'Trip t1', ownerId: uid, closedAt: null }));

    const { result } = renderHook(() => useTrips(), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.trips).toHaveLength(1);

    await act(async () => { await auth.signOut(); });
    await act(async () => { await result.current.refetch(); });

    expect(result.current.trips).toHaveLength(0);
  });
});

// ── NetworkError ──────────────────────────────────────────────────────────────

describe('useTrips — NetworkError from storage', () => {
  it('sets error, returns empty trips, and stops loading when the repo fails', async () => {
    const container = createTestContainer();
    const auth     = container.resolve(AUTH);
    await auth.signInAsGuest('Jay');

    const tripRepo = container.resolve(TRIP_REPO) as InMemoryTripRepository;
    tripRepo.getTripsForUser = async () => err({ kind: 'NetworkError', message: 'connection refused' });

    const { result } = renderHook(() => useTrips(), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.trips).toHaveLength(0);
    expect(result.current.error).toMatchObject({ kind: 'NetworkError', message: 'connection refused' });
  });
});

// ── Closed trip filter ────────────────────────────────────────────────────────

describe('useTrips — closed trip filter', () => {
  it('excludes closed trips from the returned list', async () => {
    const container = createTestContainer();
    const auth    = container.resolve(AUTH);
    const storage = container.resolve(TRIP_REPO);

    const res = await auth.signInAsGuest('Jay');
    const uid = res.ok ? res.value.id : '';

    await storage.saveTrip(tripFactory({ id: 't1', name: 'Trip t1', ownerId: uid, status: 'active', closedAt: null }));
    await storage.saveTrip(tripFactory({ id: 't2', name: 'Trip t2', ownerId: uid, status: 'settling', closedAt: null }));
    await storage.saveTrip(tripFactory({ id: 't3', name: 'Trip t3', ownerId: uid, status: 'closed', closedAt: null }));

    const { result } = renderHook(() => useTrips(), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.trips).toHaveLength(2);
    expect(result.current.trips.map(t => t.id).sort()).toEqual(['t1', 't2']);
    expect(result.current.trips.every(t => t.status !== 'closed')).toBe(true);
  });

  it('returns empty list when all trips are closed', async () => {
    const container = createTestContainer();
    const auth    = container.resolve(AUTH);
    const storage = container.resolve(TRIP_REPO);

    const res = await auth.signInAsGuest('Jay');
    const uid = res.ok ? res.value.id : '';

    await storage.saveTrip(tripFactory({ id: 't1', name: 'Trip t1', ownerId: uid, status: 'closed', closedAt: null }));
    await storage.saveTrip(tripFactory({ id: 't2', name: 'Trip t2', ownerId: uid, status: 'closed', closedAt: null }));

    const { result } = renderHook(() => useTrips(), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.trips).toHaveLength(0);
  });
});
