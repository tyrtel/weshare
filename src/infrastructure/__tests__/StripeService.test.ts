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
  openBrowserAsync: jest.fn(),
}));

import * as WebBrowser from 'expo-web-browser';
import { StripeService } from '../services/StripeService';
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

describe('StripeService — createCheckoutSession', () => {
  const service = new StripeService();

  it('maps a successful response to a StripeCheckoutSession', async () => {
    supabase.functions.invoke.mockResolvedValue({
      data: {
        checkout_url:           'https://checkout.stripe.com/cs_abc',
        stripe_session_id:      'cs_abc',
        stripe_payment_link_id: 'pl_abc',
      },
      error: null,
    });

    const result = await service.createCheckoutSession('req1', 't1', 'marie', 2500, 'EUR', 'Dinner');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        url:                 'https://checkout.stripe.com/cs_abc',
        stripeSessionId:     'cs_abc',
        stripePaymentLinkId: 'pl_abc',
      });
    }
    expect(supabase.functions.invoke).toHaveBeenCalledWith('create-payment-link', {
      body: {
        split_request_id: 'req1',
        trip_id:          't1',
        payer_user_id:    'marie',
        amount_cents:     2500,
        currency:         'EUR',
        note:             'Dinner',
      },
    });
  });

  it('extracts the server error message from the response context when present', async () => {
    supabase.functions.invoke.mockResolvedValue({
      data:  null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: {
          status: 402,
          json:   jest.fn().mockResolvedValue({ error: 'Card declined' }),
        },
      },
    });

    const result = await service.createCheckoutSession('req1', 't1', 'marie', 2500, 'EUR', 'Dinner');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('NetworkError');
      expect(getErrorMessage(result.error)).toBe('Card declined');
    }
  });

  it('falls back to the HTTP status when the error body has no message', async () => {
    supabase.functions.invoke.mockResolvedValue({
      data:  null,
      error: {
        message: 'non-2xx',
        context: { status: 500, json: jest.fn().mockResolvedValue({}) },
      },
    });

    const result = await service.createCheckoutSession('req1', 't1', 'marie', 2500, 'EUR', 'Dinner');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(getErrorMessage(result.error)).toBe('HTTP 500');
  });

  it('falls back to error.message when there is no response context (network failure)', async () => {
    supabase.functions.invoke.mockResolvedValue({
      data:  null,
      error: { message: 'Failed to fetch' },
    });

    const result = await service.createCheckoutSession('req1', 't1', 'marie', 2500, 'EUR', 'Dinner');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(getErrorMessage(result.error)).toBe('Failed to fetch');
  });

  it('returns an error when the function reports no error but sends no data', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: null, error: null });

    const result = await service.createCheckoutSession('req1', 't1', 'marie', 2500, 'EUR', 'Dinner');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(getErrorMessage(result.error)).toBe('Empty response from create-payment-link');
  });
});

describe('StripeService — getPaymentStatus', () => {
  const service = new StripeService();

  it('polls with the session token and maps the returned status', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'user-jwt' } } });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok:   true,
      json: jest.fn().mockResolvedValue({ status: 'completed' }),
    });

    const result = await service.getPaymentStatus('cs_abc');

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe('completed');

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain('payment-status');
    expect(url).toContain('stripe_session_id=cs_abc');
    expect(init.headers.Authorization).toBe('Bearer user-jwt');
  });

  it('falls back to the anon key when there is no active session', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok:   true,
      json: jest.fn().mockResolvedValue({ status: 'pending' }),
    });

    await service.getPaymentStatus('cs_abc');

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer anon-key-test');
  });

  it('returns a NetworkError on a non-2xx response', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 404 });

    const result = await service.getPaymentStatus('cs_missing');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(getErrorMessage(result.error)).toBe('HTTP 404');
  });

  it('returns a NetworkError when fetch throws', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    (global.fetch as jest.Mock).mockRejectedValue(new Error('offline'));

    const result = await service.getPaymentStatus('cs_abc');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(getErrorMessage(result.error)).toBe('offline');
  });
});

describe('StripeService — openCheckout', () => {
  it('opens the URL in the system browser', async () => {
    const service = new StripeService();
    await service.openCheckout('https://checkout.stripe.com/cs_abc');
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith('https://checkout.stripe.com/cs_abc');
  });
});
