import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react-native';
import { ServiceContext } from '../../../core/di/ServiceContext';
import { createTestContainer } from '../../../core/di/testContainer';
import { STRIPE } from '../../../core/di/tokens';
import { MockStripeService } from '../../../__mocks__/MockStripeService';
import { StripePaymentCard } from '../StripePaymentCard';
import type { SplitRequest } from '../../../core/models/SplitRequest';
import { splitRequestFactory } from '../../../__testUtils__/factories';

// Clipboard is not available in the test renderer environment.
jest.mock('react-native/Libraries/Components/Clipboard/Clipboard', () => ({
  setString: jest.fn(),
  getString:  jest.fn(() => Promise.resolve('')),
}));

function makeWrapper() {
  const container = createTestContainer();
  return {
    container,
    wrapper: function Wrapper({ children }: { children: React.ReactNode }) {
      return React.createElement(ServiceContext.Provider, { value: container }, children);
    },
  };
}

const NOW = new Date('2025-06-01T12:00:00Z');

const CHECKOUT_URL = 'https://checkout.stripe.com/pay/cs_test_abc123';

// ── Initial render ────────────────────────────────────────────────────────────

describe('StripePaymentCard — initial render', () => {
  it('shows the Pending status badge when splitRequest.status is pending', () => {
    const { wrapper } = makeWrapper();
    render(
      <StripePaymentCard splitRequest={splitRequestFactory({ status: 'pending' })} checkoutUrl={CHECKOUT_URL} />,
      { wrapper },
    );
    expect(screen.getByText('Pending')).toBeTruthy();
  });

  it('displays the checkout URL', () => {
    const { wrapper } = makeWrapper();
    render(
      <StripePaymentCard splitRequest={splitRequestFactory({ status: 'pending' })} checkoutUrl={CHECKOUT_URL} />,
      { wrapper },
    );
    expect(screen.getByText(CHECKOUT_URL)).toBeTruthy();
  });

  it('shows the Paid badge immediately when splitRequest.status is already completed', () => {
    const { wrapper } = makeWrapper();
    render(
      <StripePaymentCard
        splitRequest={splitRequestFactory({ status: 'completed', stripeSessionId: null })}
        checkoutUrl={CHECKOUT_URL}
      />,
      { wrapper },
    );
    expect(screen.getByText('Paid')).toBeTruthy();
  });
});

// ── QR code visibility ────────────────────────────────────────────────────────

describe('StripePaymentCard — QR code', () => {
  it('shows the QR code when status is pending', () => {
    const { wrapper } = makeWrapper();
    render(
      <StripePaymentCard splitRequest={splitRequestFactory({ status: 'pending' })} checkoutUrl={CHECKOUT_URL} />,
      { wrapper },
    );
    expect(screen.getByLabelText('Stripe checkout QR code')).toBeTruthy();
  });

  it('hides the QR code when status is completed', () => {
    const { wrapper } = makeWrapper();
    render(
      <StripePaymentCard
        splitRequest={splitRequestFactory({ status: 'completed', stripeSessionId: null })}
        checkoutUrl={CHECKOUT_URL}
      />,
      { wrapper },
    );
    expect(screen.queryByLabelText('Stripe checkout QR code')).toBeNull();
  });

  it('hides the QR code when status is declined', () => {
    const { wrapper } = makeWrapper();
    render(
      <StripePaymentCard
        splitRequest={splitRequestFactory({ status: 'declined', stripeSessionId: null })}
        checkoutUrl={CHECKOUT_URL}
      />,
      { wrapper },
    );
    expect(screen.queryByLabelText('Stripe checkout QR code')).toBeNull();
  });
});

// ── Status polling ────────────────────────────────────────────────────────────

describe('StripePaymentCard — status polling', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  it('updates the status badge when the poller returns a completed status', async () => {
    const { container, wrapper } = makeWrapper();
    const stripe = container.resolve(STRIPE) as MockStripeService;
    stripe.mockStatus = 'completed';

    render(
      <StripePaymentCard splitRequest={splitRequestFactory({ status: 'pending', stripeSessionId: 'sess_test_abc' })} checkoutUrl={CHECKOUT_URL} />,
      { wrapper },
    );

    expect(screen.getByText('Pending')).toBeTruthy();

    // Advance past the 6 s poll interval and let the async callback settle.
    await act(async () => {
      jest.advanceTimersByTime(6001);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByText('Paid')).toBeTruthy();
    });
  });

  it('stops polling once a terminal status is reached', async () => {
    const { container, wrapper } = makeWrapper();
    const stripe = container.resolve(STRIPE) as MockStripeService;
    stripe.mockStatus = 'declined';

    render(
      <StripePaymentCard splitRequest={splitRequestFactory({ status: 'pending', stripeSessionId: 'sess_test_abc' })} checkoutUrl={CHECKOUT_URL} />,
      { wrapper },
    );

    await act(async () => {
      jest.advanceTimersByTime(6001);
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByText('Declined')).toBeTruthy());

    // Reset the call count and advance another full interval.
    const callsBefore = stripe.sessionCalls.length;
    await act(async () => {
      jest.advanceTimersByTime(6001);
      await Promise.resolve();
    });

    // getPaymentStatus should not have been called again after reaching 'declined'.
    // We verify indirectly: the badge stays 'Declined' and stripe was not re-queried.
    expect(screen.getByText('Declined')).toBeTruthy();
    expect(stripe.sessionCalls.length).toBe(callsBefore);
  });
});
