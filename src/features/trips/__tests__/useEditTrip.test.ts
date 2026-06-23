import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { useEditTrip } from '../hooks/useEditTrip';
import { ServiceContext } from '../../../core/di/ServiceContext';
import { createTestContainer } from '../../../core/di/testContainer';
import { EXPENSE_REPO, TRIP_REPO, TRIP_STORE } from '../../../core/di/tokens';
import type { ServiceContainer } from '../../../core/di/ServiceContainer';
import type { Trip } from '../../../core/models/Trip';
import { expenseFactory, tripFactory } from '../../../__testUtils__/factories';

function makeWrapper(container: ServiceContainer) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(ServiceContext.Provider, { value: container }, children);
  };
}

const NOW = new Date('2025-06-01T12:00:00Z');

describe('useEditTrip — validation', () => {
  it('returns null and sets ValidationError for empty name', async () => {
    const container = createTestContainer();
    const { result } = renderHook(() => useEditTrip(), { wrapper: makeWrapper(container) });

    let trip: Trip | null = tripFactory();
    await act(async () => {
      trip = await result.current.editTrip(tripFactory(), '   ', 'EUR');
    });

    expect(trip).toBeNull();
    expect(result.current.error?.kind).toBe('ValidationError');
    if (result.current.error?.kind === 'ValidationError') {
      expect(result.current.error.field).toBe('name');
    }
  });
});

describe('useEditTrip — success', () => {
  let container: ServiceContainer;

  beforeEach(async () => {
    container = createTestContainer();
    const tripRepo = container.resolve(TRIP_REPO);
    await tripRepo.saveTrip(tripFactory());
  });

  it('returns the updated trip', async () => {
    const { result } = renderHook(() => useEditTrip(), { wrapper: makeWrapper(container) });

    let updated: Trip | null = null;
    await act(async () => {
      updated = await result.current.editTrip(tripFactory(), 'Paris Trip', 'USD');
    });

    expect(updated).not.toBeNull();
    expect(updated?.name).toBe('Paris Trip');
    expect(updated?.currency).toBe('USD');
  });

  it('trims whitespace from the name', async () => {
    const { result } = renderHook(() => useEditTrip(), { wrapper: makeWrapper(container) });

    let updated: Trip | null = null;
    await act(async () => {
      updated = await result.current.editTrip(tripFactory(), '  Road Trip  ', 'GBP');
    });

    expect(updated?.name).toBe('Road Trip');
  });

  it('persists the update in storage', async () => {
    const { result } = renderHook(() => useEditTrip(), { wrapper: makeWrapper(container) });
    const tripRepo = container.resolve(TRIP_REPO);

    await act(async () => {
      await result.current.editTrip(tripFactory(), 'Updated Name', 'EUR');
    });

    const fetched = await tripRepo.getTrip('t1');
    expect(fetched.ok).toBe(true);
    if (fetched.ok) expect(fetched.value.name).toBe('Updated Name');
  });

  it('loading is false before and after submission', async () => {
    const { result } = renderHook(() => useEditTrip(), { wrapper: makeWrapper(container) });
    expect(result.current.loading).toBe(false);

    await act(async () => {
      await result.current.editTrip(tripFactory(), 'New Name', 'EUR');
    });

    expect(result.current.loading).toBe(false);
  });
});

describe('useEditTrip — expense currency recalculation', () => {
  let container: ServiceContainer;

  beforeEach(async () => {
    container = createTestContainer();
    const tripRepo    = container.resolve(TRIP_REPO);
    const expenseRepo = container.resolve(EXPENSE_REPO);
    const storeApi    = container.resolve(TRIP_STORE);

    await tripRepo.saveTrip(tripFactory({ currency: 'EUR' }));

    const e1 = expenseFactory({ id: 'e1', currency: 'EUR' });
    const e2 = expenseFactory({ id: 'e2', currency: 'EUR' });
    await expenseRepo.saveExpense(e1);
    await expenseRepo.saveExpense(e2);
    storeApi.getState().appendExpense(e1);
    storeApi.getState().appendExpense(e2);
  });

  it('updates every expense to the new currency', async () => {
    const { result } = renderHook(() => useEditTrip(), { wrapper: makeWrapper(container) });
    const expenseRepo = container.resolve(EXPENSE_REPO);

    await act(async () => {
      await result.current.editTrip(tripFactory({ currency: 'EUR' }), 'Chez Paul', 'USD');
    });

    const e1 = await expenseRepo.getExpense('e1');
    const e2 = await expenseRepo.getExpense('e2');
    expect(e1.ok && e1.value.currency).toBe('USD');
    expect(e2.ok && e2.value.currency).toBe('USD');
  });

  it('does not touch expenses when currency is unchanged', async () => {
    const { result } = renderHook(() => useEditTrip(), { wrapper: makeWrapper(container) });
    const expenseRepo = container.resolve(EXPENSE_REPO);

    await act(async () => {
      await result.current.editTrip(tripFactory({ currency: 'EUR' }), 'Chez Paul', 'EUR');
    });

    const e1 = await expenseRepo.getExpense('e1');
    expect(e1.ok && e1.value.currency).toBe('EUR');
  });

  it('skips expenses that already carry a different currency', async () => {
    const expenseRepo = container.resolve(EXPENSE_REPO);
    const storeApi    = container.resolve(TRIP_STORE);
    // An expense paid in a foreign currency — currency field is already USD
    const foreign = expenseFactory({ id: 'e3', currency: 'USD' });
    await expenseRepo.saveExpense(foreign);
    storeApi.getState().appendExpense(foreign);

    const { result } = renderHook(() => useEditTrip(), { wrapper: makeWrapper(container) });

    await act(async () => {
      await result.current.editTrip(tripFactory({ currency: 'EUR' }), 'Chez Paul', 'GBP');
    });

    const e3 = await expenseRepo.getExpense('e3');
    expect(e3.ok && e3.value.currency).toBe('USD');
  });

  it('reflects updated currencies in the store', async () => {
    const { result } = renderHook(() => useEditTrip(), { wrapper: makeWrapper(container) });
    const storeApi    = container.resolve(TRIP_STORE);

    await act(async () => {
      await result.current.editTrip(tripFactory({ currency: 'EUR' }), 'Chez Paul', 'GBP');
    });

    const storedExpenses = storeApi.getState().expenses['t1'] ?? [];
    expect(storedExpenses.every(e => e.currency === 'GBP')).toBe(true);
  });
});

describe('useEditTrip — storage error', () => {
  it('returns null and sets error when trip does not exist', async () => {
    const container = createTestContainer();
    const { result } = renderHook(() => useEditTrip(), { wrapper: makeWrapper(container) });

    // Trip 't1' was never saved — updateTrip returns NotFoundError.
    let updated: Trip | null = tripFactory();
    await act(async () => {
      updated = await result.current.editTrip(tripFactory(), 'New Name', 'EUR');
    });

    expect(updated).toBeNull();
    expect(result.current.error).not.toBeNull();
  });
});
