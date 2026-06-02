import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { ok, err } from '../../core/types/Result';
import type { Result } from '../../core/types/Result';
import type { AppError } from '../../core/types/AppError';
import type { IOpenBankingService, OBInitiateResult, OBProvider } from '../../core/interfaces/IOpenBankingService';
import type { SplitRequestStatus } from '../../core/models/SplitRequest';
import { supabase } from '../supabase/supabaseClient';

function edgeFunctionUrl(name: string): string {
  const base = (Constants.expoConfig?.extra?.supabaseUrl as string | undefined) ?? '';
  return `${base}/functions/v1/${name}`;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const anonKey = (Constants.expoConfig?.extra?.supabaseAnonKey as string | undefined) ?? '';
  return {
    'Authorization': `Bearer ${session?.access_token ?? anonKey}`,
    'apikey':        anonKey,
  };
}

export class OpenBankingService implements IOpenBankingService {
  async initiatePayment(
    splitRequestId: string,
    amountCents:    number,
    currency:       string,
    note:           string,
    creditorIban:   string,
  ): Promise<Result<OBInitiateResult, AppError>> {
    const { data, error } = await supabase.functions.invoke<{
      authorization_url: string;
      ob_payment_id:     string;
      ob_provider:       string;
    }>('ob-initiate', {
      body: {
        split_request_id: splitRequestId,
        amount_cents:     amountCents,
        currency,
        note,
        creditor_iban:    creditorIban,
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

    if (!data) return err({ kind: 'NetworkError', message: 'Empty response from ob-initiate' });

    return ok({
      authorizationUrl: data.authorization_url,
      obPaymentId:      data.ob_payment_id,
      obProvider:       data.ob_provider as OBProvider,
    });
  }

  async getPaymentStatus(
    obPaymentId: string,
    obProvider:  OBProvider,
  ): Promise<Result<SplitRequestStatus, AppError>> {
    try {
      // ob-status uses GET with query params so we can't use functions.invoke().
      // Attach the session JWT manually so the function can optionally verify it (SEC-14).
      const authHeaders = await getAuthHeaders();
      const params      = new URLSearchParams({ ob_payment_id: obPaymentId, ob_provider: obProvider });
      const response    = await fetch(`${edgeFunctionUrl('ob-status')}?${params.toString()}`, {
        headers: { 'Content-Type': 'application/json', ...authHeaders },
      });

      if (!response.ok) {
        return err({ kind: 'NetworkError', message: `OB status poll failed: ${response.status}` });
      }

      const data = await response.json() as { status: SplitRequestStatus };
      return ok(data.status);
    } catch (e) {
      return err({ kind: 'NetworkError', message: e instanceof Error ? e.message : 'OB status error' });
    }
  }

  async openAuthorizationUrl(url: string): Promise<void> {
    await WebBrowser.openAuthSessionAsync(url, 'ouishare://ob-return');
  }
}
