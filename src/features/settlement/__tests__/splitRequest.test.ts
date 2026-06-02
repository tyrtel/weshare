import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { DeepLinkPaymentService } from '../../../infrastructure/services/DeepLinkPaymentService';
import { MockPaymentService } from '../../../__mocks__/MockPaymentService';
import { MockStripeService } from '../../../__mocks__/MockStripeService';
import { useSettlement } from '../hooks/useSettlement';
import { ServiceContext } from '../../../core/di/ServiceContext';
import { createTestContainer } from '../../../core/di/testContainer';
import {
  TRIP_REPO, MEMBER_REPO, EXPENSE_REPO, SPLIT_REPO, SPLIT_REQUEST_REPO, TRIP_STORE, STRIPE,
} from '../../../core/di/tokens';
import { InMemoryTripRepository } from '../../../__mocks__/InMemoryTripRepository';
import { InMemoryMemberRepository } from '../../../__mocks__/InMemoryMemberRepository';
import { InMemoryExpenseRepository } from '../../../__mocks__/InMemoryExpenseRepository';
import { InMemorySplitRepository } from '../../../__mocks__/InMemorySplitRepository';
import { InMemorySplitRequestRepository } from '../../../__mocks__/InMemorySplitRequestRepository';
import type { ServiceContainer } from '../../../core/di/ServiceContainer';
import { tripFactory, memberFactory, expenseFactory, splitFactory, splitRequestFactory } from '../../../__testUtils__/factories';

// ── URL builder tests (pure functions, no DI needed) ─────────────────────────

describe('DeepLinkPaymentService — buildPaymentLink', () => {
  const svc = new DeepLinkPaymentService();

  it('builds a Revolut deep link', () => {
    const url = svc.buildPaymentLink('revolut', 2500, 'EUR', 'marie');
    expect(url).toMatch(/^revolut:\/\/pay/);
    expect(url).toContain('amount=25.00');
    expect(url).toContain('currency=EUR');
  });

  it('builds a Venmo deep link', () => {
    const url = svc.buildPaymentLink('venmo', 1000, 'USD', 'tom');
    expect(url).toMatch(/^venmo:\/\//);
    expect(url).toContain('10.00');
  });

  it('builds a Lydia deep link', () => {
    const url = svc.buildPaymentLink('lydia', 500, 'EUR', 'sara');
    expect(url).toMatch(/^lydia:\/\/request/);
    expect(url).toContain('amount=5.00');
  });

  it('builds a PayPal web URL', () => {
    const url = svc.buildPaymentLink('paypal', 7500, 'EUR', 'alex');
    expect(url).toMatch(/^https:\/\/paypal\.me\/alex\/75\.00/);
  });

  it('builds an other/generic HTTPS URL', () => {
    const url = svc.buildPaymentLink('other', 300, 'GBP', 'lee');
    expect(url).toMatch(/^https:\/\//);
    expect(url).toContain('amount=3.00');
  });

  it('URL-encodes recipient handles with special characters', () => {
    const url = svc.buildPaymentLink('revolut', 1000, 'EUR', 'user name');
    expect(url).toContain('user%20name');
  });

  it('formats zero-decimal amounts correctly', () => {
    const url = svc.buildPaymentLink('paypal', 100, 'EUR', 'alice');
    expect(url).toContain('1.00');
  });
});

// ── MockPaymentService tests ──────────────────────────────────────────────────

describe('MockPaymentService', () => {
  it('returns the mock URL format', () => {
    const svc = new MockPaymentService();
    const url = svc.buildPaymentLink('revolut', 2500, 'EUR', 'marie');
    expect(url).toContain('revolut://pay/marie');
  });

  it('records each call', () => {
    const svc = new MockPaymentService();
    svc.buildPaymentLink('lydia', 1000, 'EUR', 'tom');
    svc.buildPaymentLink('paypal', 500, 'USD', 'sara');
    expect(svc.calls).toHaveLength(2);
    expect(svc.calls[0].provider).toBe('lydia');
    expect(svc.calls[1].provider).toBe('paypal');
  });

  it('getInstalledWallets returns all by default', async () => {
    const svc = new MockPaymentService();
    const wallets = await svc.getInstalledWallets();
    expect(wallets).toContain('revolut');
    expect(wallets).toContain('lydia');
    expect(wallets).toContain('paypal');
    expect(wallets).toContain('other');
  });

  it('getInstalledWallets respects installedWallets override', async () => {
    const svc = new MockPaymentService();
    svc.installedWallets = ['paypal', 'other'];
    const wallets = await svc.getInstalledWallets();
    expect(wallets).toEqual(['paypal', 'other']);
    expect(wallets).not.toContain('revolut');
  });
});

// ── Fixtures ──────────────────────────────────────────────────────────────────


function makeWrapper(container: ServiceContainer) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(ServiceContext.Provider, { value: container }, children);
  };
}

function seedBasic(container: ServiceContainer) {
  const splits = [
    splitFactory({ id: 's1', expenseId: 'e1', userId: 'jay', amountOwedCents: 2500 }),
    splitFactory({ id: 's2', expenseId: 'e1', userId: 'marie', amountOwedCents: 2500 }),
  ];
  (container.resolve(TRIP_REPO) as InMemoryTripRepository).seed([tripFactory({ ownerId: 'jay' })]);
  (container.resolve(MEMBER_REPO) as InMemoryMemberRepository).seed(
    ['jay', 'marie'].map(id => memberFactory({ userId: id, displayName: id })),
  );
  (container.resolve(EXPENSE_REPO) as InMemoryExpenseRepository).seed(
    [expenseFactory({ id: 'e1', tripId: 't1', paidByUserId: 'jay', totalAmountCents: 5000, description: 'e1', splits: splits })], splits,
  );
  (container.resolve(SPLIT_REPO) as InMemorySplitRepository).seed(splits);
}

// ── InMemorySplitRequestRepository — SplitRequest CRUD ───────────────────────

describe('InMemorySplitRequestRepository — SplitRequest CRUD', () => {
  it('saves and retrieves a SplitRequest', async () => {
    const container    = createTestContainer();
    const splitReqRepo = container.resolve(SPLIT_REQUEST_REPO);
    const req          = splitRequestFactory();

    const saved = await splitReqRepo.saveSplitRequest(req);
    expect(saved.ok).toBe(true);

    const fetched = await splitReqRepo.getSplitRequest(req.id);
    expect(fetched.ok).toBe(true);
    if (fetched.ok) {
      expect(fetched.value.id).toBe(req.id);
      expect(fetched.value.status).toBe('created');
    }
  });

  it('returns NotFoundError for unknown id', async () => {
    const container = createTestContainer();
    const result    = await container.resolve(SPLIT_REQUEST_REPO).getSplitRequest('no-such-id');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NotFoundError');
  });

  it('updates the status of a SplitRequest', async () => {
    const container    = createTestContainer();
    const splitReqRepo = container.resolve(SPLIT_REQUEST_REPO);
    const req          = splitRequestFactory();

    await splitReqRepo.saveSplitRequest(req);
    const updated = await splitReqRepo.updateSplitRequest({ ...req, status: 'request_sent' });
    expect(updated.ok).toBe(true);

    const fetched = await splitReqRepo.getSplitRequest(req.id);
    if (fetched.ok) expect(fetched.value.status).toBe('request_sent');
  });

  it('returns NotFoundError when updating a non-existent request', async () => {
    const container = createTestContainer();
    const req       = splitRequestFactory({ id: 'ghost' });
    const result    = await container.resolve(SPLIT_REQUEST_REPO).updateSplitRequest(req);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NotFoundError');
  });

  it('queries by tripId', async () => {
    const container    = createTestContainer();
    const splitReqRepo = container.resolve(SPLIT_REQUEST_REPO);

    await splitReqRepo.saveSplitRequest(splitRequestFactory({ id: 'r1', tripId: 't1' }));
    await splitReqRepo.saveSplitRequest(splitRequestFactory({ id: 'r2', tripId: 't1' }));
    await splitReqRepo.saveSplitRequest(splitRequestFactory({ id: 'r3', tripId: 't2' }));

    const result = await splitReqRepo.getSplitRequestsForTrip('t1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(2);
      expect(result.value.every(r => r.tripId === 't1')).toBe(true);
    }
  });
});

// ── useSettlement — SplitRequest integration ──────────────────────────────────

describe('useSettlement — SplitRequest tracking', () => {
  it('settlements start with latestRequest=null when no requests exist', async () => {
    const container = createTestContainer();
    seedBasic(container);

    const { result } = renderHook(() => useSettlement('t1'), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.settlements[0].latestRequest).toBeNull();
  });

  it('attaches the latest SplitRequest to the matching settlement', async () => {
    const container = createTestContainer();
    seedBasic(container);

    // Pre-seed a SplitRequest for marie→jay.
    (container.resolve(SPLIT_REQUEST_REPO) as InMemorySplitRequestRepository).seed([
      splitRequestFactory({ payerUserId: 'marie', requesterUserId: 'jay', status: 'request_sent' }),
    ]);

    const { result } = renderHook(() => useSettlement('t1'), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const marieRow = result.current.settlements.find(s => s.fromUserId === 'marie');
    expect(marieRow?.latestRequest?.status).toBe('request_sent');
  });

  it('updateRequestStatus optimistically updates local state', async () => {
    const container = createTestContainer();
    seedBasic(container);

    const req = splitRequestFactory({ payerUserId: 'marie', requesterUserId: 'jay', status: 'request_sent' });
    await container.resolve(SPLIT_REQUEST_REPO).saveSplitRequest(req);

    const { result } = renderHook(() => useSettlement('t1'), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updateRequestStatus(req, 'pending');
    });

    const marieRow = result.current.settlements.find(s => s.fromUserId === 'marie');
    expect(marieRow?.latestRequest?.status).toBe('pending');
  });

  it('markDebtPaid creates a new SplitRequest with status paid when none exists', async () => {
    const container = createTestContainer();
    seedBasic(container);

    const { result } = renderHook(() => useSettlement('t1'), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.markDebtPaid('marie', 'jay');
    });

    const marieRow = result.current.settlements.find(s => s.fromUserId === 'marie');
    expect(marieRow?.latestRequest?.status).toBe('paid');
    expect(marieRow?.latestRequest?.payerUserId).toBe('marie');
    expect(marieRow?.latestRequest?.requesterUserId).toBe('jay');
  });

  it('markDebtPaid updates an existing owed request to paid', async () => {
    const container = createTestContainer();
    seedBasic(container);

    const req = splitRequestFactory({ payerUserId: 'marie', requesterUserId: 'jay', status: 'owed' });
    (container.resolve(SPLIT_REQUEST_REPO) as InMemorySplitRequestRepository).seed([req]);

    const { result } = renderHook(() => useSettlement('t1'), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.markDebtPaid('marie', 'jay');
    });

    const marieRow = result.current.settlements.find(s => s.fromUserId === 'marie');
    expect(marieRow?.latestRequest?.status).toBe('paid');
    expect(marieRow?.latestRequest?.id).toBe('req-1');
  });

  it('markDebtOwed reverts a paid request back to owed', async () => {
    const container = createTestContainer();
    seedBasic(container);

    const req = splitRequestFactory({ payerUserId: 'marie', requesterUserId: 'jay', status: 'paid' });
    (container.resolve(SPLIT_REQUEST_REPO) as InMemorySplitRequestRepository).seed([req]);

    const { result } = renderHook(() => useSettlement('t1'), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.markDebtOwed('marie', 'jay');
    });

    const marieRow = result.current.settlements.find(s => s.fromUserId === 'marie');
    expect(marieRow?.latestRequest?.status).toBe('owed');
  });

  it('markDebtOwed does nothing when the request is in a payment flow', async () => {
    const container = createTestContainer();
    seedBasic(container);

    const req = splitRequestFactory({ payerUserId: 'marie', requesterUserId: 'jay', status: 'pending' });
    (container.resolve(SPLIT_REQUEST_REPO) as InMemorySplitRequestRepository).seed([req]);

    const { result } = renderHook(() => useSettlement('t1'), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.markDebtOwed('marie', 'jay');
    });

    const marieRow = result.current.settlements.find(s => s.fromUserId === 'marie');
    expect(marieRow?.latestRequest?.status).toBe('pending');
  });

  it('markDebtOwed does nothing when no request exists', async () => {
    const container = createTestContainer();
    seedBasic(container);

    const { result } = renderHook(() => useSettlement('t1'), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.markDebtOwed('marie', 'jay');
    });

    const marieRow = result.current.settlements.find(s => s.fromUserId === 'marie');
    expect(marieRow?.latestRequest).toBeNull();
  });

  it('picks the newest SplitRequest when multiple exist for the same pair', async () => {
    const container = createTestContainer();
    seedBasic(container);

    const older = splitRequestFactory({
      id:              'r-old',
      payerUserId:     'marie',
      requesterUserId: 'jay',
      status:          'declined',
      createdAt:       new Date('2025-05-01'),
    });
    const newer = splitRequestFactory({
      id:              'r-new',
      payerUserId:     'marie',
      requesterUserId: 'jay',
      status:          'request_sent',
      createdAt:       new Date('2025-06-01'),
    });

    (container.resolve(SPLIT_REQUEST_REPO) as InMemorySplitRequestRepository).seed([older, newer]);

    const { result } = renderHook(() => useSettlement('t1'), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const marieRow = result.current.settlements.find(s => s.fromUserId === 'marie');
    expect(marieRow?.latestRequest?.status).toBe('request_sent');
  });
});

// ── Payment flow integration ──────────────────────────────────────────────────

describe('useSettlement — payment flow: appendSplitRequest + updateRequestStatus', () => {
  it('after appendSplitRequest, settlement row shows the new request', async () => {
    const container = createTestContainer();
    seedBasic(container);

    const { result } = renderHook(() => useSettlement('t1'), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Simulate PaymentMethodSheet saving req directly to repo, then SettlementScreen
    // calling appendSplitRequest to add it to the store cache.
    const req = splitRequestFactory({
      payerUserId: 'marie', requesterUserId: 'jay',
      status: 'request_sent', stripeSessionId: 'cs_test_123',
    });

    await act(async () => {
      container.resolve(TRIP_STORE).getState().appendSplitRequest(req);
    });

    const marieRow = result.current.settlements.find(s => s.fromUserId === 'marie');
    expect(marieRow?.latestRequest?.status).toBe('request_sent');
    expect(marieRow?.latestRequest?.stripeSessionId).toBe('cs_test_123');
  });

  it('deep-link: updateRequestStatus sets pending after foreground-return confirmation', async () => {
    const container = createTestContainer();
    seedBasic(container);

    const req = splitRequestFactory({
      payerUserId: 'marie', requesterUserId: 'jay', status: 'request_sent',
    });

    const { result } = renderHook(() => useSettlement('t1'), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Simulate payment launch: append to store cache, then user confirms payment
    await act(async () => {
      container.resolve(TRIP_STORE).getState().appendSplitRequest(req);
    });
    // Seed repo so updateSplitRequest can find the record
    await container.resolve(SPLIT_REQUEST_REPO).saveSplitRequest(req);

    await act(async () => {
      await result.current.updateRequestStatus(req, 'pending');
    });

    const marieRow = result.current.settlements.find(s => s.fromUserId === 'marie');
    expect(marieRow?.latestRequest?.status).toBe('pending');
  });

  it('Stripe poller propagates completed status to the settlement row', async () => {
    jest.useFakeTimers();
    const stripe = new MockStripeService();
    stripe.mockStatus = 'completed';

    const container = createTestContainer({ stripe });
    seedBasic(container);

    const req = splitRequestFactory({
      payerUserId: 'marie', requesterUserId: 'jay',
      status: 'request_sent', stripeSessionId: 'cs_live_abc',
    });
    await container.resolve(SPLIT_REQUEST_REPO).saveSplitRequest(req);

    const { result } = renderHook(() => useSettlement('t1'), { wrapper: makeWrapper(container) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Append req to store so poller detects it and starts polling
    await act(async () => {
      container.resolve(TRIP_STORE).getState().appendSplitRequest(req);
    });

    // Advance timer to trigger the poller
    await act(async () => {
      jest.advanceTimersByTime(5_000);
      await Promise.resolve();
    });

    await waitFor(() => {
      const marieRow = result.current.settlements.find(s => s.fromUserId === 'marie');
      return marieRow?.latestRequest?.status === 'completed';
    });

    jest.useRealTimers();
  });
});
