// Replace useFocusEffect with useEffect so the hook fires without navigation context.
jest.mock('expo-router', () => ({
  useFocusEffect: (cb: Parameters<typeof import('react').useEffect>[0]) => {
    const { useEffect } = require('react');
    useEffect(cb, [cb]);
  },
}));

import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { useClosedTrips } from '../hooks/useClosedTrips';
import { ServiceContext } from '../../../core/di/ServiceContext';
import { createTestContainer } from '../../../core/di/testContainer';
import { AUTH, TRIP_REPO } from '../../../core/di/tokens';
import type { ServiceContainer } from '../../../core/di/ServiceContainer';
import type { Trip } from '../../../core/models/Trip';
import { tripFactory } from '../../../__testUtils__/factories';

function makeWrapper(container: ServiceContainer) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(ServiceContext.Provider, { value: container }, children);
  };
}

const BASE_DATE = new Date('2026-01-01T00:00:00Z');

// ── No user ───────────────────────────────────────────────────────────────────

describe('useClosedTrips — no signed-in user', () => {
  it('returns empty list when no user is signed in', async () => {
    const container = createTestContainer();
    const { result } = renderHook(() => useClosedTrips(), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.trips).toHaveLength(0);
    expect(result.current.error).toBeNull();
  });
});

// ── Status filter ─────────────────────────────────────────────────────────────

describe('useClosedTrips — status filter', () => {
  it('returns only closed trips; excludes active and settling', async () => {
    const container = createTestContainer();
    const auth    = container.resolve(AUTH);
    const storage = container.resolve(TRIP_REPO);

    const res = await auth.signInAsGuest('Jay');
    const uid = res.ok ? res.value.id : '';

    await storage.saveTrip(tripFactory({ id: 't1', name: 'Trip t1', ownerId: uid, status: 'active', closedAt: null }));
    await storage.saveTrip(tripFactory({ id: 't2', name: 'Trip t2', ownerId: uid, status: 'settling', closedAt: null }));
    await storage.saveTrip(tripFactory({ id: 't3', name: 'Trip t3', ownerId: uid, status: 'closed', closedAt: new Date('2026-05-01T00:00:00Z') }));
    await storage.saveTrip(tripFactory({ id: 't4', name: 'Trip t4', ownerId: uid, status: 'closed', closedAt: new Date('2026-05-15T00:00:00Z') }));

    const { result } = renderHook(() => useClosedTrips(), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.trips).toHaveLength(2);
    expect(result.current.trips.every(t => t.status === 'closed')).toBe(true);
    expect(result.current.trips.map(t => t.id).sort()).toEqual(['t3', 't4']);
  });
});

// ── Sort order ────────────────────────────────────────────────────────────────

describe('useClosedTrips — sort order', () => {
  it('sorts by closedAt descending — most recently closed first', async () => {
    const container = createTestContainer();
    const auth    = container.resolve(AUTH);
    const storage = container.resolve(TRIP_REPO);

    const res = await auth.signInAsGuest('Jay');
    const uid = res.ok ? res.value.id : '';

    await storage.saveTrip(tripFactory({ id: 't-old', name: 'Trip t-old', ownerId: uid, status: 'closed', closedAt: new Date('2026-03-01T00:00:00Z') }));
    await storage.saveTrip(tripFactory({ id: 't-recent', name: 'Trip t-recent', ownerId: uid, status: 'closed', closedAt: new Date('2026-05-28T00:00:00Z') }));
    await storage.saveTrip(tripFactory({ id: 't-mid', name: 'Trip t-mid', ownerId: uid, status: 'closed', closedAt: new Date('2026-04-15T00:00:00Z') }));

    const { result } = renderHook(() => useClosedTrips(), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const ids = result.current.trips.map(t => t.id);
    expect(ids).toEqual(['t-recent', 't-mid', 't-old']);
  });
});

// ── Refetch ───────────────────────────────────────────────────────────────────

describe('useClosedTrips — refetch', () => {
  it('picks up newly closed trips after refetch', async () => {
    const container = createTestContainer();
    const auth    = container.resolve(AUTH);
    const storage = container.resolve(TRIP_REPO);

    const res = await auth.signInAsGuest('Jay');
    const uid = res.ok ? res.value.id : '';

    const { result } = renderHook(() => useClosedTrips(), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.trips).toHaveLength(0);

    await storage.saveTrip(tripFactory({ id: 't1', name: 'Trip t1', ownerId: uid, status: 'closed', closedAt: new Date('2026-05-01T00:00:00Z') }));
    await act(async () => { await result.current.refetch(); });

    expect(result.current.trips).toHaveLength(1);
  });
});
