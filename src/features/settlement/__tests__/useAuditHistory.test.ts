import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { useAuditHistory } from '../hooks/useAuditHistory';
import { ServiceContext } from '../../../core/di/ServiceContext';
import { createTestContainer } from '../../../core/di/testContainer';
import { SPLIT_REQUEST_REPO } from '../../../core/di/tokens';
import { InMemorySplitRequestRepository } from '../../../__mocks__/InMemorySplitRequestRepository';
import { err } from '../../../core/types/Result';
import type { ServiceContainer } from '../../../core/di/ServiceContainer';
import type { SplitRequest } from '../../../core/models/SplitRequest';
import { splitRequestFactory } from '../../../__testUtils__/factories';

function makeWrapper(container: ServiceContainer) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(ServiceContext.Provider, { value: container }, children);
  };
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const T1 = new Date('2025-06-01T12:00:00Z');
const T2 = new Date('2025-06-10T12:00:00Z');
const T3 = new Date('2025-06-20T12:00:00Z');

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useAuditHistory', () => {
  it('returns only requests matching fromUserId and toUserId', async () => {
    const container = createTestContainer();
    const repo      = container.resolve(SPLIT_REQUEST_REPO) as InMemorySplitRequestRepository;
    repo.seed([
      splitRequestFactory({ id: 'r1', payerUserId: 'alice', requesterUserId: 'bob', createdAt: T1, updatedAt: T1 }),    // matches
      splitRequestFactory({ id: 'r2', payerUserId: 'alice', requesterUserId: 'carol', createdAt: T2, updatedAt: T2 }),   // wrong toUserId
      splitRequestFactory({ id: 'r3', payerUserId: 'bob', requesterUserId: 'alice', createdAt: T3, updatedAt: T3 }),   // wrong fromUserId (reversed)
    ]);

    const { result } = renderHook(
      () => useAuditHistory('t1', 'alice', 'bob'),
      { wrapper: makeWrapper(container) },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.requests).toHaveLength(1);
    expect(result.current.requests[0].id).toBe('r1');
  });

  it('returns records in reverse-chronological order', async () => {
    const container = createTestContainer();
    const repo      = container.resolve(SPLIT_REQUEST_REPO) as InMemorySplitRequestRepository;
    repo.seed([
      splitRequestFactory({ id: 'old', payerUserId: 'alice', requesterUserId: 'bob', createdAt: T1, updatedAt: T1 }),
      splitRequestFactory({ id: 'mid', payerUserId: 'alice', requesterUserId: 'bob', createdAt: T2, updatedAt: T2 }),
      splitRequestFactory({ id: 'new', payerUserId: 'alice', requesterUserId: 'bob', createdAt: T3, updatedAt: T3 }),
    ]);

    const { result } = renderHook(
      () => useAuditHistory('t1', 'alice', 'bob'),
      { wrapper: makeWrapper(container) },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    const ids = result.current.requests.map(r => r.id);
    expect(ids).toEqual(['new', 'mid', 'old']);
  });

  it('returns an empty array when no matching requests exist', async () => {
    const container = createTestContainer();
    const repo      = container.resolve(SPLIT_REQUEST_REPO) as InMemorySplitRequestRepository;
    repo.seed([splitRequestFactory({ id: 'r1', payerUserId: 'carol', requesterUserId: 'dave', createdAt: T1, updatedAt: T1 })]);

    const { result } = renderHook(
      () => useAuditHistory('t1', 'alice', 'bob'),
      { wrapper: makeWrapper(container) },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.requests).toHaveLength(0);
    expect(result.current.error).toBeNull();
  });

  it('returns an empty array when the trip has no requests at all', async () => {
    const container = createTestContainer();

    const { result } = renderHook(
      () => useAuditHistory('t1', 'alice', 'bob'),
      { wrapper: makeWrapper(container) },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.requests).toHaveLength(0);
  });

  it('only returns requests for the given tripId', async () => {
    const container = createTestContainer();
    const repo      = container.resolve(SPLIT_REQUEST_REPO) as InMemorySplitRequestRepository;
    repo.seed([
      splitRequestFactory({ id: 'r1', payerUserId: 'alice', requesterUserId: 'bob', createdAt: T1, updatedAt: T1, ...{ tripId: 't1' } }),
      splitRequestFactory({ id: 'r2', payerUserId: 'alice', requesterUserId: 'bob', createdAt: T2, updatedAt: T2, ...{ tripId: 't2' } }),  // different trip
    ]);

    const { result } = renderHook(
      () => useAuditHistory('t1', 'alice', 'bob'),
      { wrapper: makeWrapper(container) },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.requests).toHaveLength(1);
    expect(result.current.requests[0].id).toBe('r1');
  });

  it('sets error and clears requests when repository fails', async () => {
    const container = createTestContainer();
    const repo      = container.resolve(SPLIT_REQUEST_REPO) as InMemorySplitRequestRepository;
    jest.spyOn(repo, 'getSplitRequestsForTrip').mockResolvedValueOnce(
      err({ kind: 'NetworkError', message: 'timeout' }),
    );

    const { result } = renderHook(
      () => useAuditHistory('t1', 'alice', 'bob'),
      { wrapper: makeWrapper(container) },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toMatchObject({ kind: 'NetworkError' });
    expect(result.current.requests).toHaveLength(0);
  });

  it('starts in loading state', () => {
    const container = createTestContainer();

    const { result } = renderHook(
      () => useAuditHistory('t1', 'alice', 'bob'),
      { wrapper: makeWrapper(container) },
    );

    expect(result.current.loading).toBe(true);
  });
});
