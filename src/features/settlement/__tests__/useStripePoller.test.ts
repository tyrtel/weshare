import React from 'react';
import { renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { useStripePoller } from '../hooks/useStripePoller';
import { ServiceContext } from '../../../core/di/ServiceContext';
import { createTestContainer } from '../../../core/di/testContainer';
import { MockStripeService } from '../../../__mocks__/MockStripeService';
import { splitRequestFactory } from '../../../__testUtils__/factories';
import type { ServiceContainer } from '../../../core/di/ServiceContainer';
import type { SplitRequestStatus } from '../../../core/models/SplitRequest';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function tick(ms: number) {
  jest.advanceTimersByTime(ms);
  await Promise.resolve();
  await Promise.resolve();
}

function makeWrapper(container: ServiceContainer) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(ServiceContext.Provider, { value: container }, children);
  };
}

// ── Setup ─────────────────────────────────────────────────────────────────────

let mockStripe: MockStripeService;
let container: ServiceContainer;

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() } as any);

  mockStripe = new MockStripeService();
  container  = createTestContainer({ stripe: mockStripe });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

// ── No-op cases ───────────────────────────────────────────────────────────────

describe('useStripePoller — disabled (no polling expected)', () => {
  it('does not poll when splitRequest is null', async () => {
    const onStatusChange = jest.fn();

    renderHook(() => useStripePoller(null, onStatusChange), { wrapper: makeWrapper(container) });

    await tick(6_000);

    expect(onStatusChange).not.toHaveBeenCalled();
  });

  it('does not poll when stripeSessionId is null', async () => {
    const req = splitRequestFactory({ status: 'created', stripeSessionId: null });
    const onStatusChange = jest.fn();

    renderHook(() => useStripePoller(req, onStatusChange), { wrapper: makeWrapper(container) });

    await tick(6_000);

    expect(onStatusChange).not.toHaveBeenCalled();
  });

  it('does not poll when status is completed', async () => {
    const req = splitRequestFactory({ status: 'completed', stripeSessionId: 'cs_done' });
    const onStatusChange = jest.fn();

    renderHook(() => useStripePoller(req, onStatusChange), { wrapper: makeWrapper(container) });

    await tick(6_000);

    expect(onStatusChange).not.toHaveBeenCalled();
  });

  it('does not poll when status is declined', async () => {
    const req = splitRequestFactory({ status: 'declined', stripeSessionId: 'cs_fail' });
    const onStatusChange = jest.fn();

    renderHook(() => useStripePoller(req, onStatusChange), { wrapper: makeWrapper(container) });

    await tick(6_000);

    expect(onStatusChange).not.toHaveBeenCalled();
  });

  it('does not poll when status is expired', async () => {
    const req = splitRequestFactory({ status: 'expired', stripeSessionId: 'cs_exp' });
    const onStatusChange = jest.fn();

    renderHook(() => useStripePoller(req, onStatusChange), { wrapper: makeWrapper(container) });

    await tick(6_000);

    expect(onStatusChange).not.toHaveBeenCalled();
  });

  it('does not poll when status is owed', async () => {
    const req = splitRequestFactory({ status: 'owed', stripeSessionId: 'cs_owed' });
    const onStatusChange = jest.fn();

    renderHook(() => useStripePoller(req, onStatusChange), { wrapper: makeWrapper(container) });

    await tick(6_000);

    expect(onStatusChange).not.toHaveBeenCalled();
  });

  it('does not poll when status is paid', async () => {
    const req = splitRequestFactory({ status: 'paid', stripeSessionId: 'cs_paid' });
    const onStatusChange = jest.fn();

    renderHook(() => useStripePoller(req, onStatusChange), { wrapper: makeWrapper(container) });

    await tick(6_000);

    expect(onStatusChange).not.toHaveBeenCalled();
  });
});

// ── Active polling cases ──────────────────────────────────────────────────────

describe('useStripePoller — active polling (STRIPE_POLLABLE statuses)', () => {
  const pollableStatuses: SplitRequestStatus[] = ['created', 'request_sent', 'pending', 'authorized'];

  for (const status of pollableStatuses) {
    it(`polls when status is '${status}'`, async () => {
      mockStripe.mockStatus = 'pending';
      const req = splitRequestFactory({ status, stripeSessionId: 'cs_active' });
      const onStatusChange = jest.fn();

      renderHook(() => useStripePoller(req, onStatusChange), { wrapper: makeWrapper(container) });

      await tick(5_000);

      expect(onStatusChange).toHaveBeenCalledWith('pending');
    });
  }

  it('calls onStatusChange with the status returned by getPaymentStatus', async () => {
    mockStripe.mockStatus = 'authorized';
    const req = splitRequestFactory({ status: 'created', stripeSessionId: 'cs_auth' });
    const onStatusChange = jest.fn();

    renderHook(() => useStripePoller(req, onStatusChange), { wrapper: makeWrapper(container) });

    await tick(5_000);

    expect(onStatusChange).toHaveBeenCalledWith('authorized');
  });

  it('polls repeatedly on each interval', async () => {
    mockStripe.mockStatus = 'pending';
    const req = splitRequestFactory({ status: 'created', stripeSessionId: 'cs_rep' });
    const onStatusChange = jest.fn();

    renderHook(() => useStripePoller(req, onStatusChange), { wrapper: makeWrapper(container) });

    await tick(5_000);
    expect(onStatusChange).toHaveBeenCalledTimes(1);

    await tick(5_000);
    expect(onStatusChange).toHaveBeenCalledTimes(2);
  });

  it('stops polling after a terminal status is received', async () => {
    mockStripe.mockStatus = 'completed';
    const req = splitRequestFactory({ status: 'pending', stripeSessionId: 'cs_done' });
    const onStatusChange = jest.fn();

    renderHook(() => useStripePoller(req, onStatusChange), { wrapper: makeWrapper(container) });

    await tick(5_000);
    expect(onStatusChange).toHaveBeenCalledWith('completed');
    expect(onStatusChange).toHaveBeenCalledTimes(1);

    await tick(10_000);
    expect(onStatusChange).toHaveBeenCalledTimes(1);
  });

  it('does not call onStatusChange when getPaymentStatus fails', async () => {
    mockStripe.shouldFail = true;
    const req = splitRequestFactory({ status: 'pending', stripeSessionId: 'cs_err' });
    const onStatusChange = jest.fn();

    renderHook(() => useStripePoller(req, onStatusChange), { wrapper: makeWrapper(container) });

    await tick(5_000);

    expect(onStatusChange).not.toHaveBeenCalled();
  });
});
