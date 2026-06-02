// Replace useFocusEffect with useEffect so the hook fires without navigation context.
jest.mock('expo-router', () => ({
  useFocusEffect: (cb: Parameters<typeof import('react').useEffect>[0]) => {
    const { useEffect } = require('react');
    useEffect(cb, [cb]);
  },
}));

import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { useTripDetail } from '../hooks/useTripDetail';
import { ServiceContext } from '../../../core/di/ServiceContext';
import { createTestContainer } from '../../../core/di/testContainer';
import { TRIP_REPO, EXPENSE_REPO } from '../../../core/di/tokens';
import type { ServiceContainer } from '../../../core/di/ServiceContainer';
import type { Trip } from '../../../core/models/Trip';
import type { Expense } from '../../../core/models/Expense';
import type { TripMember } from '../../../core/models/TripMember';
import { tripFactory, expenseFactory } from '../../../__testUtils__/factories';

function makeWrapper(container: ServiceContainer) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(ServiceContext.Provider, { value: container }, children);
  };
}

const NOW = new Date('2025-06-01T12:00:00Z');

// ── Loading state ─────────────────────────────────────────────────────────────

describe('useTripDetail — loading', () => {
  it('starts with loading=true', () => {
    const container = createTestContainer();
    const { result } = renderHook(() => useTripDetail('t1'), { wrapper: makeWrapper(container) });
    expect(result.current.loading).toBe(true);
  });

  it('loading becomes false after data resolves', async () => {
    const container = createTestContainer();
    await container.resolve(TRIP_REPO).saveTrip(tripFactory({ ownerId: 'jay' }));

    const { result } = renderHook(() => useTripDetail('t1'), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));
  });
});

// ── Data loading ──────────────────────────────────────────────────────────────

describe('useTripDetail — data', () => {
  let container: ServiceContainer;

  beforeEach(async () => {
    container = createTestContainer();
    await container.resolve(TRIP_REPO).saveTrip(tripFactory({ ownerId: 'jay' }));
    await container.resolve(EXPENSE_REPO).saveExpense(expenseFactory({ id: 'e1', tripId: 't1', paidByUserId: 'jay', totalAmountCents: 10000 }));
    await container.resolve(EXPENSE_REPO).saveExpense(expenseFactory({ id: 'e2', tripId: 't1', paidByUserId: 'jay', totalAmountCents: 10000 }));
  });

  it('returns the trip', async () => {
    const { result } = renderHook(() => useTripDetail('t1'), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.trip).not.toBeNull();
    expect(result.current.trip?.name).toBe('Chez Paul');
  });

  it('returns expenses for the trip', async () => {
    const { result } = renderHook(() => useTripDetail('t1'), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.expenses).toHaveLength(2);
  });

  it('returns empty expenses for a trip with none', async () => {
    await container.resolve(TRIP_REPO).saveTrip(tripFactory({ id: 't2', ownerId: 'jay' }));

    const { result } = renderHook(() => useTripDetail('t2'), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.expenses).toHaveLength(0);
  });
});

// ── Error handling ────────────────────────────────────────────────────────────

describe('useTripDetail — errors', () => {
  it('sets error when trip is not found', async () => {
    const container = createTestContainer();
    const { result } = renderHook(() => useTripDetail('nonexistent'), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.trip).toBeNull();
    expect(result.current.error?.kind).toBe('NotFoundError');
  });
});

// ── Refetch ───────────────────────────────────────────────────────────────────

describe('useTripDetail — refetch', () => {
  it('picks up newly added expenses after refetch', async () => {
    const container = createTestContainer();
    await container.resolve(TRIP_REPO).saveTrip(tripFactory({ ownerId: 'jay' }));

    const { result } = renderHook(() => useTripDetail('t1'), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.expenses).toHaveLength(0);

    await container.resolve(EXPENSE_REPO).saveExpense(expenseFactory({ id: 'e1', paidByUserId: 'jay', totalAmountCents: 10000 }));

    await act(async () => { await result.current.refetch(); });

    expect(result.current.expenses).toHaveLength(1);
  });
});
