jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        supabaseUrl:     'https://project.supabase.co',
        supabaseAnonKey: 'anon-key-test',
      },
    },
  },
}));

jest.mock('../supabase/supabaseClient', () => ({
  supabase: {
    functions: { invoke: jest.fn() },
    auth:      { getSession: jest.fn() },
  },
}));

jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(),
}));

import * as WebBrowser from 'expo-web-browser';
import { OpenBankingService } from '../services/OpenBankingService';
import { getErrorMessage } from '../../core/types/AppError';

const { supabase } = require('../supabase/supabaseClient') as {
  supabase: {
    functions: { invoke: jest.Mock };
    auth:      { getSession: jest.Mock };
  };
};

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn();
});

describe('OpenBankingService — initiatePayment', () => {
  const service = new OpenBankingService();

  it('maps a successful response to an OBInitiateResult', async () => {
    supabase.functions.invoke.mockResolvedValue({
      data: {
        authorization_url: 'https://link.tink.com/1.0/pay?paymentRequestId=abc',
        ob_payment_id:      'abc',
        ob_provider:        'tink',
      },
      error: null,
    });

    const result = await service.initiatePayment('req1', 2500, 'EUR', 'Dinner', 'FR7630006000011234567890189');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        authorizationUrl: 'https://link.tink.com/1.0/pay?paymentRequestId=abc',
        obPaymentId:      'abc',
        obProvider:       'tink',
      });
    }
    expect(supabase.functions.invoke).toHaveBeenCalledWith('ob-initiate', {
      body: {
        split_request_id: 'req1',
        amount_cents:     2500,
        currency:         'EUR',
        note:             'Dinner',
        creditor_iban:    'FR7630006000011234567890189',
      },
    });
  });

  it('extracts the server error message from the response context when present', async () => {
    supabase.functions.invoke.mockResolvedValue({
      data:  null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: {
          status: 400,
          json:   jest.fn().mockResolvedValue({ error: 'Invalid IBAN' }),
        },
      },
    });

    const result = await service.initiatePayment('req1', 2500, 'EUR', 'Dinner', 'not-an-iban');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('NetworkError');
      expect(getErrorMessage(result.error)).toBe('Invalid IBAN');
    }
  });

  it('falls back to error.message when there is no response context', async () => {
    supabase.functions.invoke.mockResolvedValue({
      data:  null,
      error: { message: 'Failed to fetch' },
    });

    const result = await service.initiatePayment('req1', 2500, 'EUR', 'Dinner', 'FR76...');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(getErrorMessage(result.error)).toBe('Failed to fetch');
  });

  it('returns an error when the function reports no error but sends no data', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: null, error: null });

    const result = await service.initiatePayment('req1', 2500, 'EUR', 'Dinner', 'FR76...');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(getErrorMessage(result.error)).toBe('Empty response from ob-initiate');
  });
});

describe('OpenBankingService — getPaymentStatus', () => {
  const service = new OpenBankingService();

  it('polls with the session token and maps the returned status', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'user-jwt' } } });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok:   true,
      json: jest.fn().mockResolvedValue({ status: 'authorized' }),
    });

    const result = await service.getPaymentStatus('pay_abc', 'tink');

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe('authorized');

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain('ob-status');
    expect(url).toContain('ob_payment_id=pay_abc');
    expect(url).toContain('ob_provider=tink');
    expect(init.headers.Authorization).toBe('Bearer user-jwt');
  });

  it('falls back to the anon key when there is no active session', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok:   true,
      json: jest.fn().mockResolvedValue({ status: 'pending' }),
    });

    await service.getPaymentStatus('pay_abc', 'tink');

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer anon-key-test');
  });

  it('returns a NetworkError on a non-2xx response', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 404 });

    const result = await service.getPaymentStatus('pay_missing', 'tink');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(getErrorMessage(result.error)).toContain('404');
  });

  it('returns a NetworkError when fetch throws', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    (global.fetch as jest.Mock).mockRejectedValue(new Error('offline'));

    const result = await service.getPaymentStatus('pay_abc', 'tink');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(getErrorMessage(result.error)).toBe('offline');
  });
});

describe('OpenBankingService — openAuthorizationUrl', () => {
  it('opens an auth session pointed at the ob-return deep link', async () => {
    const service = new OpenBankingService();
    await service.openAuthorizationUrl('https://bank.example/authorize');
    expect(WebBrowser.openAuthSessionAsync).toHaveBeenCalledWith(
      'https://bank.example/authorize',
      'ouishare://ob-return',
    );
  });
});
