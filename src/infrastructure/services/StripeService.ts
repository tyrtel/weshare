import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { ok, err } from '../../core/types/Result';
import type { Result } from '../../core/types/Result';
import type { AppError } from '../../core/types/AppError';
import type { SplitRequestStatus } from '../../core/models/SplitRequest';
import type { IStripeService, StripeCheckoutSession } from '../../core/interfaces/IStripeService';
import { supabase } from '../supabase/supabaseClient';

function edgeFunctionUrl(name: string): string {
  const base = (Constants.expoConfig?.extra?.supabaseUrl as string | undefined) ?? '';
  return `${base}/functions/v1/${name}`;
}

export class StripeService implements IStripeService {
  async createCheckoutSession(
    splitRequestId: string,
    tripId:         string,
    payerUserId:    string,
    amountCents:    number,
    currency:       string,
    note:           string,
  ): Promise<Result<StripeCheckoutSession, AppError>> {
    const { data, error } = await supabase.functions.invoke<{
      checkout_url:           string;
      stripe_session_id:      string;
      stripe_payment_link_id: string | null;
    }>('create-payment-link', {
      body: {
        split_request_id: splitRequestId,
        trip_id:          tripId,
        payer_user_id:    payerUserId,
        amount_cents:     amountCents,
        currency,
        note,
      },
    });

    if (error) {
      const context = (error as { context?: Response }).context;
      if (context) {
        const body = await context.json().catch(() => ({} as { error?: string })) as { error?: string };
        return err({ kind: 'NetworkError', message: body.error ?? `HTTP ${context.status}` });
      }
      return err({ kind: 'NetworkError', message: error.message });
    }

    if (!data) return err({ kind: 'NetworkError', message: 'Empty response from create-payment-link' });

    return ok({
      url:                 data.checkout_url,
      stripeSessionId:     data.stripe_session_id,
      stripePaymentLinkId: data.stripe_payment_link_id,
    });
  }

  async getPaymentStatus(stripeSessionId: string): Promise<Result<SplitRequestStatus, AppError>> {
    try {
      // payment-status uses GET with query params so we can't use functions.invoke().
      // Attach the session JWT manually so the function can optionally verify it (SEC-14).
      const { data: { session } } = await supabase.auth.getSession();
      const anonKey = (Constants.expoConfig?.extra?.supabaseAnonKey as string | undefined) ?? '';
      const token   = session?.access_token ?? anonKey;

      const url      = `${edgeFunctionUrl('payment-status')}?stripe_session_id=${encodeURIComponent(stripeSessionId)}`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'apikey':        anonKey,
        },
      });

      if (!response.ok) {
        return err({ kind: 'NetworkError', message: `HTTP ${response.status}` });
      }

      const data = await response.json() as { status: string };
      return ok(data.status as SplitRequestStatus);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Network request failed';
      return err({ kind: 'NetworkError', message });
    }
  }

  async openCheckout(url: string): Promise<void> {
    await WebBrowser.openBrowserAsync(url);
  }
}
