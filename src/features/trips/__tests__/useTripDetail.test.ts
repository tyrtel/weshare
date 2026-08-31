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
import { TRIP_REPO, EXPENSE_REPO, MEMBER_REPO } from '../../../core/di/tokens';
import type { ServiceContainer } from '../../../core/di/ServiceContainer';
import { tripFactory, expenseFactory, memberFactory } from '../../../__testUtils__/factories';

function makeWrapper(container: ServiceContainer) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(ServiceContext.Provider, { value: container }, children);
  };
}


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

// ── Payer identity survives a fresh load ──────────────────────────────────────
// Regression coverage for a reported bug: create an expense, pick a non-owner
// member as payer, save, then leave and come back to the trip — the payer no
// longer showed as who paid. useFocusEffect re-runs this hook's load() (and
// its own equivalent refetch) every time the screen regains focus, which is
// exactly "returning" to the trip — so the payer identity must survive both a
// first load and an explicit refetch, matched against a trip member that
// actually exists (not just a raw id the UI can't resolve to a name).

describe('useTripDetail — payer identity survives a fresh load', () => {
  it('preserves a non-owner payer on first load, resolvable against trip.members', async () => {
    const container = createTestContainer();
    await container.resolve(TRIP_REPO).saveTrip(tripFactory({ ownerId: 'jay' }));
    await container.resolve(MEMBER_REPO).addMember(memberFactory({ tripId: 't1', userId: 'marie', displayName: 'Marie' }));
    await container.resolve(EXPENSE_REPO).saveExpense(
      expenseFactory({ id: 'e1', tripId: 't1', paidByUserId: 'marie', totalAmountCents: 5000 }),
    );

    const { result } = renderHook(() => useTripDetail('t1'), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.expenses[0].paidByUserId).toBe('marie');
    expect(result.current.trip?.members.some(m => m.userId === 'marie')).toBe(true);
  });

  it('still resolves the same payer after an explicit refetch (the "return to the trip" path)', async () => {
    const container = createTestContainer();
    await container.resolve(TRIP_REPO).saveTrip(tripFactory({ ownerId: 'jay' }));
    await container.resolve(MEMBER_REPO).addMember(memberFactory({ tripId: 't1', userId: 'marie', displayName: 'Marie' }));
    await container.resolve(EXPENSE_REPO).saveExpense(
      expenseFactory({ id: 'e1', tripId: 't1', paidByUserId: 'marie', totalAmountCents: 5000 }),
    );

    const { result } = renderHook(() => useTripDetail('t1'), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.refetch(); });

    const reloaded = result.current.expenses.find(e => e.id === 'e1');
    expect(reloaded?.paidByUserId).toBe('marie');
    expect(result.current.trip?.members.find(m => m.userId === 'marie')?.displayName).toBe('Marie');
  });
});
