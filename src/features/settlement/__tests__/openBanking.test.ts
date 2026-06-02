import { MockOpenBankingService } from '../../../__mocks__/MockOpenBankingService';
import { createTestContainer } from '../../../core/di/testContainer';
import { OPEN_BANKING, SPLIT_REQUEST_REPO } from '../../../core/di/tokens';
import { validateIBAN, formatIBAN } from '../utils/ibanValidation';
import type { SplitRequest } from '../../../core/models/SplitRequest';
import { splitRequestFactory } from '../../../__testUtils__/factories';

// ── IBAN validation (pure, no DI) ─────────────────────────────────────────────

describe('validateIBAN', () => {
  it('accepts a valid French IBAN', () => {
    expect(validateIBAN('FR7630006000011234567890189')).toBe(true);
  });

  it('accepts a valid German IBAN', () => {
    expect(validateIBAN('DE89370400440532013000')).toBe(true);
  });

  it('accepts a valid Spanish IBAN', () => {
    expect(validateIBAN('ES9121000418450200051332')).toBe(true);
  });

  it('accepts a valid UK IBAN', () => {
    expect(validateIBAN('GB29NWBK60161331926819')).toBe(true);
  });

  it('rejects a wrong-length IBAN', () => {
    expect(validateIBAN('FR763000600001')).toBe(false);
  });

  it('rejects an IBAN with a bad checksum', () => {
    // Flip one digit in a valid FR IBAN
    expect(validateIBAN('FR7630006000011234567890188')).toBe(false);
  });

  it('strips spaces before validating', () => {
    expect(validateIBAN('FR76 3000 6000 0112 3456 7890 189')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(validateIBAN('fr7630006000011234567890189')).toBe(true);
  });

  it('rejects an unknown country code', () => {
    expect(validateIBAN('XX123456789012')).toBe(false);
  });
});

describe('formatIBAN', () => {
  it('groups digits in fours', () => {
    expect(formatIBAN('FR7630006000011234567890189')).toBe('FR76 3000 6000 0112 3456 7890 189');
  });

  it('strips and reformats spaced input', () => {
    expect(formatIBAN('FR76 30006000 011')).toBe('FR76 3000 6000 011');
  });
});

// ── MockOpenBankingService unit tests ─────────────────────────────────────────

describe('MockOpenBankingService — initiatePayment', () => {
  it('returns the mock authorization URL', async () => {
    const svc    = new MockOpenBankingService();
    const result = await svc.initiatePayment('req-1', 2500, 'EUR', 'dinner', 'FR7630006000011234567890189');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.obPaymentId).toBe('mock_tink_test');
      expect(result.value.obProvider).toBe('tink');
      expect(result.value.authorizationUrl).toContain('tink.com');
    }
  });

  it('records call parameters', async () => {
    const svc = new MockOpenBankingService();
    await svc.initiatePayment('req-1', 5000, 'EUR', 'brunch', 'FR7630006000011234567890189');

    expect(svc.initiateCalls).toHaveLength(1);
    expect(svc.initiateCalls[0]).toMatchObject({
      splitRequestId: 'req-1',
      amountCents:    5000,
      currency:       'EUR',
    });
  });

  it('returns an error when shouldFail=true', async () => {
    const svc      = new MockOpenBankingService();
    svc.shouldFail = true;
    const result   = await svc.initiatePayment('req-1', 1000, 'EUR', '', 'FR7630006000011234567890189');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NetworkError');
  });
});

describe('MockOpenBankingService — getPaymentStatus', () => {
  it('returns pending by default', async () => {
    const svc    = new MockOpenBankingService();
    const result = await svc.getPaymentStatus('pay_123', 'tink');

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe('pending');
  });

  it('returns the configured mock status', async () => {
    const svc          = new MockOpenBankingService();
    svc.mockStatus     = 'completed';
    const result       = await svc.getPaymentStatus('pay_123', 'tink');

    if (result.ok) expect(result.value).toBe('completed');
  });

  it('returns error when shouldFail=true', async () => {
    const svc      = new MockOpenBankingService();
    svc.shouldFail = true;
    const result   = await svc.getPaymentStatus('pay_123', 'tink');
    expect(result.ok).toBe(false);
  });
});

describe('MockOpenBankingService — openAuthorizationUrl', () => {
  it('records the opened URL', async () => {
    const svc = new MockOpenBankingService();
    await svc.openAuthorizationUrl('https://link.tink.com/pay?id=abc');
    expect(svc.openedUrls).toEqual(['https://link.tink.com/pay?id=abc']);
  });
});

// ── OB SplitRequest — storage integration ────────────────────────────────────

const NOW = new Date('2025-06-01T12:00:00Z');

describe('OB SplitRequest — storage integration', () => {
  it('saves a SplitRequest with OB fields', async () => {
    const container = createTestContainer();
    const storage   = container.resolve(SPLIT_REQUEST_REPO);

    const req = splitRequestFactory({
      obPaymentId: 'tink_pay_abc123',
      obProvider:  'tink',
      status:      'request_sent',
    });

    const saved = await storage.saveSplitRequest(req);
    expect(saved.ok).toBe(true);

    const fetched = await storage.getSplitRequest(req.id);
    expect(fetched.ok).toBe(true);
    if (fetched.ok) {
      expect(fetched.value.obPaymentId).toBe('tink_pay_abc123');
      expect(fetched.value.obProvider).toBe('tink');
    }
  });

  it('transitions status to authorized when bank approves', async () => {
    const container = createTestContainer();
    const storage   = container.resolve(SPLIT_REQUEST_REPO);

    const req = splitRequestFactory({ obPaymentId: 'tink_pay_xyz', obProvider: 'tink', status: 'request_sent' });
    await storage.saveSplitRequest(req);

    const authorized = { ...req, status: 'authorized' as const, updatedAt: new Date() };
    await storage.updateSplitRequest(authorized);

    const fetched = await storage.getSplitRequest(req.id);
    if (fetched.ok) expect(fetched.value.status).toBe('authorized');
  });

  it('transitions status to completed when SEPA settles', async () => {
    const container = createTestContainer();
    const storage   = container.resolve(SPLIT_REQUEST_REPO);

    const req = splitRequestFactory({ obPaymentId: 'tink_pay_done', obProvider: 'tink', status: 'authorized' });
    await storage.saveSplitRequest(req);

    const completed = { ...req, status: 'completed' as const, updatedAt: new Date() };
    await storage.updateSplitRequest(completed);

    const fetched = await storage.getSplitRequest(req.id);
    if (fetched.ok) expect(fetched.value.status).toBe('completed');
  });

  it('transitions status to declined when bank rejects', async () => {
    const container = createTestContainer();
    const storage   = container.resolve(SPLIT_REQUEST_REPO);

    const req = splitRequestFactory({ obPaymentId: 'tink_pay_fail', obProvider: 'tink', status: 'request_sent' });
    await storage.saveSplitRequest(req);

    const declined = { ...req, status: 'declined' as const, updatedAt: new Date() };
    await storage.updateSplitRequest(declined);

    const fetched = await storage.getSplitRequest(req.id);
    if (fetched.ok) expect(fetched.value.status).toBe('declined');
  });

  it('getSplitRequestsForTrip returns all OB requests for a trip', async () => {
    const container = createTestContainer();
    const storage   = container.resolve(SPLIT_REQUEST_REPO);

    await storage.saveSplitRequest(splitRequestFactory({ id: 'ob-1', obPaymentId: 'p1', obProvider: 'tink' }));
    await storage.saveSplitRequest(splitRequestFactory({ id: 'ob-2', obPaymentId: 'p2', obProvider: 'tink' }));
    await storage.saveSplitRequest(splitRequestFactory({ id: 'ob-3', tripId: 't2' }));

    const result = await storage.getSplitRequestsForTrip('t1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(2);
      expect(result.value.every(r => r.obProvider === 'tink')).toBe(true);
    }
  });
});

// ── DI container: OPEN_BANKING token is registered ───────────────────────────

describe('DI — OPEN_BANKING token', () => {
  it('resolves MockOpenBankingService from the test container', () => {
    const container = createTestContainer();
    const svc       = container.resolve(OPEN_BANKING);
    expect(typeof svc.initiatePayment).toBe('function');
    expect(typeof svc.getPaymentStatus).toBe('function');
    expect(typeof svc.openAuthorizationUrl).toBe('function');
  });

  it('supports overriding the open banking service', async () => {
    const custom       = new MockOpenBankingService();
    custom.mockStatus  = 'authorized';
    const container    = createTestContainer({ openBanking: custom });
    const svc          = container.resolve(OPEN_BANKING);

    const result = await svc.getPaymentStatus('pay_x', 'tink');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe('authorized');
  });
});
