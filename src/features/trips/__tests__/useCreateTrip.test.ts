import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { useCreateTrip } from '../hooks/useCreateTrip';
import { ServiceContext } from '../../../core/di/ServiceContext';
import { createTestContainer } from '../../../core/di/testContainer';
import { AUTH, TRIP_REPO } from '../../../core/di/tokens';
import type { ServiceContainer } from '../../../core/di/ServiceContainer';

// Wrapper that injects a fresh test container into the ServiceContext.
function makeWrapper(container: ServiceContainer) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(ServiceContext.Provider, { value: container }, children);
  };
}

describe('useCreateTrip', () => {
  let container: ServiceContainer;

  beforeEach(() => {
    container = createTestContainer();
  });

  it('returns null and sets AuthError when not signed in', async () => {
    const { result } = renderHook(() => useCreateTrip(), {
      wrapper: makeWrapper(container),
    });

    let trip: import('../../../core/models/Trip').Trip | null = null;
    await act(async () => {
      trip = await result.current.createTrip('Chez Paul', 'EUR');
    });

    expect(trip).toBeNull();
    expect(result.current.error?.kind).toBe('AuthError');
  });

  it('returns null and sets ValidationError for empty name', async () => {
    // Sign in as guest so auth check passes.
    const auth = container.resolve(AUTH);
    await auth.signInAsGuest('Jay');

    const { result } = renderHook(() => useCreateTrip(), {
      wrapper: makeWrapper(container),
    });

    let trip: import('../../../core/models/Trip').Trip | null = null;
    await act(async () => {
      trip = await result.current.createTrip('   ', 'EUR');
    });

    expect(trip).toBeNull();
    expect(result.current.error?.kind).toBe('ValidationError');
  });

  it('creates a trip and returns it', async () => {
    const auth = container.resolve(AUTH);
    await auth.signInAsGuest('Jay');

    const { result } = renderHook(() => useCreateTrip(), {
      wrapper: makeWrapper(container),
    });

    let trip: import('../../../core/models/Trip').Trip | null = null;
    await act(async () => {
      trip = await result.current.createTrip('Chez Paul', 'EUR');
    });

    expect(trip).not.toBeNull();
    expect(trip?.name).toBe('Chez Paul');
    expect(trip?.currency).toBe('EUR');
  });

  it('trims whitespace from the trip name', async () => {
    const auth = container.resolve(AUTH);
    await auth.signInAsGuest('Marie');

    const { result } = renderHook(() => useCreateTrip(), {
      wrapper: makeWrapper(container),
    });

    let trip: import('../../../core/models/Trip').Trip | null = null;
    await act(async () => {
      trip = await result.current.createTrip('  Road Trip  ', 'USD');
    });

    expect(trip?.name).toBe('Road Trip');
  });

  it('sets ownerId to the signed-in user id', async () => {
    const auth = container.resolve(AUTH);
    const authResult = await auth.signInAsGuest('Tom');
    const userId = authResult.ok ? authResult.value.id : '';

    const { result } = renderHook(() => useCreateTrip(), {
      wrapper: makeWrapper(container),
    });

    let trip: import('../../../core/models/Trip').Trip | null = null;
    await act(async () => {
      trip = await result.current.createTrip('Weekend', 'GBP');
    });

    expect(trip?.ownerId).toBe(userId);
  });

  it('adds the owner as the first member', async () => {
    const auth = container.resolve(AUTH);
    await auth.signInAsGuest('Sara');

    const { result } = renderHook(() => useCreateTrip(), {
      wrapper: makeWrapper(container),
    });

    let trip: import('../../../core/models/Trip').Trip | null = null;
    await act(async () => {
      trip = await result.current.createTrip('Dinner', 'EUR');
    });

    expect(trip?.members).toHaveLength(1);
    expect(trip?.members[0].displayName).toBe('Sara');
  });

  it('persists the trip in storage', async () => {
    const auth = container.resolve(AUTH);
    await auth.signInAsGuest('Jay');
    const tripRepo = container.resolve(TRIP_REPO);

    const { result } = renderHook(() => useCreateTrip(), {
      wrapper: makeWrapper(container),
    });

    let trip: import('../../../core/models/Trip').Trip | null = null;
    await act(async () => {
      trip = await result.current.createTrip('Brunch', 'EUR');
    });

    const fetched = await tripRepo.getTrip(trip!.id);
    expect(fetched.ok).toBe(true);
    if (fetched.ok) expect(fetched.value.name).toBe('Brunch');
  });

  it('loading is false when not submitting', () => {
    const { result } = renderHook(() => useCreateTrip(), {
      wrapper: makeWrapper(container),
    });
    expect(result.current.loading).toBe(false);
  });

  it('error is null initially', () => {
    const { result } = renderHook(() => useCreateTrip(), {
      wrapper: makeWrapper(container),
    });
    expect(result.current.error).toBeNull();
  });
});
