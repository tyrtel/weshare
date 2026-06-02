import { MockStripeService } from '../../../__mocks__/MockStripeService';
import { createTestContainer } from '../../../core/di/testContainer';
import { STRIPE, SPLIT_REQUEST_REPO } from '../../../core/di/tokens';
import type { SplitRequest } from '../../../core/models/SplitRequest';
import { splitRequestFactory } from '../../../__testUtils__/factories';

// ── MockStripeService unit tests ──────────────────────────────────────────────

describe('MockStripeService — createCheckoutSession', () => {
  it('returns the mock checkout session', async () => {
    const svc    = new MockStripeService();
    const result = await svc.createCheckoutSession('req-1', 'trip-1', 'user-1', 2500, 'EUR', 'dinner');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.stripeSessionId).toBe('mock_cs_test');
      expect(result.value.url).toContain('checkout.stripe.com');
    }
  });

  it('records the call parameters', async () => {
    const svc = new MockStripeService();
    await svc.createCheckoutSession('req-1', 'trip-1', 'user-1', 5000, 'USD', 'brunch');

    expect(svc.sessionCalls).toHaveLength(1);
    expect(svc.sessionCalls[0]).toMatchObject({
      splitRequestId: 'req-1',
      amountCents:    5000,
      currency:       'USD',
    });
  });

  it('returns an error when shouldFail=true', async () => {
    const svc   = new MockStripeService();
    svc.shouldFail = true;
    const result = await svc.createCheckoutSession('req-1', 'trip-1', 'user-1', 1000, 'EUR', '');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NetworkError');
  });

  it('can be configured with a custom mock session', async () => {
    const svc = new MockStripeService();
    svc.mockSession = {
      url:                 'https://checkout.stripe.com/custom-test',
      stripeSessionId:     'cs_custom_123',
      stripePaymentLinkId: 'pl_custom_456',
    };

    const result = await svc.createCheckoutSession('req-1', 'trip-1', 'user-1', 1000, 'EUR', '');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.stripeSessionId).toBe('cs_custom_123');
      expect(result.value.stripePaymentLinkId).toBe('pl_custom_456');
    }
  });
});

describe('MockStripeService — getPaymentStatus', () => {
  it('returns the mock status', async () => {
    const svc    = new MockStripeService();
    svc.mockStatus = 'completed';
    const result = await svc.getPaymentStatus('cs_test');

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe('completed');
  });

  it('returns pending by default', async () => {
    const svc    = new MockStripeService();
    const result = await svc.getPaymentStatus('cs_test');
    if (result.ok) expect(result.value).toBe('pending');
  });

  it('returns error when shouldFail=true', async () => {
    const svc      = new MockStripeService();
    svc.shouldFail = true;
    const result   = await svc.getPaymentStatus('cs_test');
    expect(result.ok).toBe(false);
  });
});

describe('MockStripeService — openCheckout', () => {
  it('records the opened URL', async () => {
    const svc = new MockStripeService();
    await svc.openCheckout('https://checkout.stripe.com/test');
    expect(svc.openedUrls).toEqual(['https://checkout.stripe.com/test']);
  });
});

// ── Integration: Stripe session persisted to storage ─────────────────────────

const NOW = new Date('2025-06-01T12:00:00Z');

describe('Stripe SplitRequest — storage integration', () => {
  it('saves a SplitRequest with Stripe session fields', async () => {
    const container = createTestContainer();
    const storage   = container.resolve(SPLIT_REQUEST_REPO);

    const req = splitRequestFactory({
      stripeSessionId:     'cs_test_abc',
      stripePaymentLinkId: null,
    });

    const saved = await storage.saveSplitRequest(req);
    expect(saved.ok).toBe(true);

    const fetched = await storage.getSplitRequest(req.id);
    expect(fetched.ok).toBe(true);
    if (fetched.ok) {
      expect(fetched.value.stripeSessionId).toBe('cs_test_abc');
      expect(fetched.value.stripePaymentLinkId).toBeNull();
    }
  });

  it('updates Stripe session ID after checkout is created', async () => {
    const container = createTestContainer();
    const storage   = container.resolve(SPLIT_REQUEST_REPO);

    // Start with no session ID (created but not yet opened).
    const req = splitRequestFactory({ status: 'created', stripeSessionId: null });
    await storage.saveSplitRequest(req);

    // Simulate the checkout session being created.
    const updated = { ...req, status: 'request_sent' as const, stripeSessionId: 'cs_live_xyz', updatedAt: new Date() };
    const result  = await storage.updateSplitRequest(updated);
    expect(result.ok).toBe(true);

    const fetched = await storage.getSplitRequest(req.id);
    if (fetched.ok) {
      expect(fetched.value.stripeSessionId).toBe('cs_live_xyz');
      expect(fetched.value.status).toBe('request_sent');
    }
  });

  it('transitions status to completed after webhook', async () => {
    const container = createTestContainer();
    const storage   = container.resolve(SPLIT_REQUEST_REPO);

    const req = splitRequestFactory({ status: 'pending', stripeSessionId: 'cs_paid_123' });
    await storage.saveSplitRequest(req);

    const completed = { ...req, status: 'completed' as const, updatedAt: new Date() };
    await storage.updateSplitRequest(completed);

    const fetched = await storage.getSplitRequest(req.id);
    if (fetched.ok) expect(fetched.value.status).toBe('completed');
  });

  it('transitions status to declined on payment failure', async () => {
    const container = createTestContainer();
    const storage   = container.resolve(SPLIT_REQUEST_REPO);

    const req = splitRequestFactory({ status: 'pending', stripeSessionId: 'cs_fail_456' });
    await storage.saveSplitRequest(req);

    const declined = { ...req, status: 'declined' as const, updatedAt: new Date() };
    await storage.updateSplitRequest(declined);

    const fetched = await storage.getSplitRequest(req.id);
    if (fetched.ok) expect(fetched.value.status).toBe('declined');
  });
});

// ── DI container: STRIPE token is registered ─────────────────────────────────

describe('DI — STRIPE token', () => {
  it('resolves MockStripeService from the test container', () => {
    const container = createTestContainer();
    const svc       = container.resolve(STRIPE);
    expect(typeof svc.createCheckoutSession).toBe('function');
    expect(typeof svc.getPaymentStatus).toBe('function');
    expect(typeof svc.openCheckout).toBe('function');
  });

  it('supports overriding the stripe service', async () => {
    const custom    = new MockStripeService();
    custom.mockStatus = 'completed';
    const container = createTestContainer({ stripe: custom });
    const svc       = container.resolve(STRIPE);

    const result = await svc.getPaymentStatus('cs_x');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe('completed');
  });
});
