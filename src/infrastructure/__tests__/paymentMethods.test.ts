jest.mock('react-native', () => ({
  Linking: {
    canOpenURL: jest.fn(),
    openURL:    jest.fn(),
  },
}));

import { Linking } from 'react-native';
import { StripePaymentMethod } from '../payment/StripePaymentMethod';
import { OpenBankingPaymentMethod } from '../payment/OpenBankingPaymentMethod';
import { DeepLinkPaymentMethod } from '../payment/DeepLinkPaymentMethod';
import { MockStripeService } from '../../__mocks__/MockStripeService';
import { MockPaymentService } from '../../__mocks__/MockPaymentService';
import { InMemorySplitRequestRepository } from '../../__mocks__/InMemorySplitRequestRepository';
import type { PaymentLaunchParams } from '../../core/interfaces/IPaymentMethod';

const mockLinking = Linking as unknown as { canOpenURL: jest.Mock; openURL: jest.Mock };

function baseParams(overrides: Partial<PaymentLaunchParams> = {}): PaymentLaunchParams {
  return {
    tripId:          't1',
    payerUserId:     'marie',
    requesterUserId: 'jay',
    amountCents:     2500,
    currency:        'EUR',
    recipientName:   'Jay',
    note:            'Dinner',
    navigate:        jest.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ── StripePaymentMethod ───────────────────────────────────────────────────────

describe('StripePaymentMethod', () => {
  it('creates a checkout session, saves a request_sent SplitRequest, and opens checkout', async () => {
    const stripe = new MockStripeService();
    stripe.mockSession = {
      url:                 'https://checkout.stripe.com/session_abc',
      stripeSessionId:     'cs_test_abc',
      stripePaymentLinkId: 'pl_test_abc',
    };
    const repo   = new InMemorySplitRequestRepository();
    const method = new StripePaymentMethod(stripe);

    const result = await method.launch(baseParams(), repo);

    expect(result).not.toBeNull();
    expect(result?.status).toBe('request_sent');
    expect(result?.stripeSessionId).toBe('cs_test_abc');
    expect(result?.stripePaymentLinkId).toBe('pl_test_abc');
    expect(stripe.sessionCalls[0]).toEqual({
      splitRequestId: result?.id,
      tripId:         't1',
      payerUserId:    'marie',
      amountCents:    2500,
      currency:       'EUR',
      note:           'Dinner',
    });
    expect(stripe.openedUrls).toEqual(['https://checkout.stripe.com/session_abc']);

    const stored = await repo.getSplitRequest(result!.id);
    expect(stored.ok).toBe(true);
  });

  // Currently a failed checkout session is dropped silently — launch() returns
  // null with no SplitRequest persisted and no signal back to the caller beyond
  // that. Pinning this down so a future change to that behavior is a deliberate
  // decision, not an accidental regression.
  it('returns null and persists nothing when checkout session creation fails', async () => {
    const stripe = new MockStripeService();
    stripe.shouldFail = true;
    const repo   = new InMemorySplitRequestRepository();
    const method = new StripePaymentMethod(stripe);

    const result = await method.launch(baseParams(), repo);

    expect(result).toBeNull();
    expect(stripe.openedUrls).toEqual([]);
    const forTrip = await repo.getSplitRequestsForTrip('t1');
    expect(forTrip.ok).toBe(true);
    if (forTrip.ok) expect(forTrip.value).toHaveLength(0);
  });
});

// ── OpenBankingPaymentMethod ──────────────────────────────────────────────────

describe('OpenBankingPaymentMethod', () => {
  it('navigates to the bank-transfer screen with the launch params and touches nothing else', async () => {
    const repo   = new InMemorySplitRequestRepository();
    const method = new OpenBankingPaymentMethod();
    const params = baseParams();

    const result = await method.launch(params, repo);

    expect(result).toBeNull();
    expect(params.navigate).toHaveBeenCalledWith('/settle/bank-transfer', {
      tripId:          't1',
      payerUserId:     'marie',
      requesterUserId: 'jay',
      amountCents:     '2500',
      currency:        'EUR',
      recipientName:   'Jay',
    });
    const forTrip = await repo.getSplitRequestsForTrip('t1');
    expect(forTrip.ok).toBe(true);
    if (forTrip.ok) expect(forTrip.value).toHaveLength(0);
  });
});

// ── DeepLinkPaymentMethod ─────────────────────────────────────────────────────

describe('DeepLinkPaymentMethod', () => {
  it('builds the link, saves as created then request_sent, and opens the URL when the app is installed', async () => {
    mockLinking.canOpenURL.mockResolvedValue(true);
    mockLinking.openURL.mockResolvedValue(undefined);

    const payment = new MockPaymentService();
    const repo    = new InMemorySplitRequestRepository();
    const saveSpy   = jest.spyOn(repo, 'saveSplitRequest');
    const updateSpy = jest.spyOn(repo, 'updateSplitRequest');
    const method  = new DeepLinkPaymentMethod('revolut', payment);

    const result = await method.launch(baseParams(), repo);

    expect(payment.calls[0]).toEqual({
      provider:        'revolut',
      amountCents:     2500,
      currency:        'EUR',
      recipientHandle: 'Jay',
    });
    expect(saveSpy).toHaveBeenCalledWith(expect.objectContaining({ status: 'created' }));
    expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ status: 'request_sent' }));
    expect(result?.status).toBe('request_sent');
    expect(result?.preferredWallet).toBe('revolut');
    expect(mockLinking.openURL).toHaveBeenCalledWith(expect.any(String));
  });

  it('still saves the request but does not open the URL when the app is not installed', async () => {
    mockLinking.canOpenURL.mockResolvedValue(false);

    const payment = new MockPaymentService();
    const repo    = new InMemorySplitRequestRepository();
    const method  = new DeepLinkPaymentMethod('venmo', payment);

    const result = await method.launch(baseParams(), repo);

    expect(result?.status).toBe('request_sent');
    expect(mockLinking.openURL).not.toHaveBeenCalled();
  });

  it('treats a canOpenURL rejection the same as "not installed" rather than throwing', async () => {
    mockLinking.canOpenURL.mockRejectedValue(new Error('probe failed'));

    const payment = new MockPaymentService();
    const repo    = new InMemorySplitRequestRepository();
    const method  = new DeepLinkPaymentMethod('lydia', payment);

    const result = await method.launch(baseParams(), repo);

    expect(result?.status).toBe('request_sent');
    expect(mockLinking.openURL).not.toHaveBeenCalled();
  });
});
