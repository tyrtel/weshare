// Tink PIS (Payment Initiation Service) helpers
// Docs: https://docs.tink.com/api#payment-initiation

const TINK_BASE = 'https://api.tink.com';

export interface TinkTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface TinkPaymentInitiateRequest {
  amount: { value: { unscaledValue: number; scale: number }; currencyCode: string };
  sourceMessage: string;
  remittanceInformation: { value: string; type: 'UNSTRUCTURED' };
  destinationMessage: string;
  creditor: { accountNumber: string; accountNumberType: 'IBAN' };
  market: string;
}

export interface TinkPaymentInitiateResponse {
  id: string;
  status: string;
  authorizationUrl?: string;
}

export type TinkPaymentStatus =
  | 'CREATED' | 'USER_AUTHORIZATION_REQUIRED' | 'INITIATED'
  | 'AUTHENTICATED' | 'PENDING' | 'PAID' | 'REJECTED' | 'CANCELLED';

export interface TinkPaymentStatusResponse {
  id: string;
  status: TinkPaymentStatus;
}

async function getClientToken(clientId: string, clientSecret: string): Promise<string> {
  const res = await fetch(`${TINK_BASE}/api/v1/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     clientId,
      client_secret: clientSecret,
      grant_type:    'client_credentials',
      scope:         'payment:write payment:read',
    }).toString(),
  });

  if (!res.ok) throw new Error(`Tink token exchange failed: ${res.status}`);
  const data = await res.json() as TinkTokenResponse;
  return data.access_token;
}

export async function tinkInitiatePayment(
  clientId: string,
  clientSecret: string,
  amountCents: number,
  currency: string,
  note: string,
  creditorIban: string,
  market: string,
  redirectUri: string,
  providerId?: string,
): Promise<TinkPaymentInitiateResponse> {
  const token = await getClientToken(clientId, clientSecret);

  const body: TinkPaymentInitiateRequest & { providerName?: string } = {
    amount: {
      value:        { unscaledValue: amountCents, scale: 2 },
      currencyCode: currency,
    },
    sourceMessage:          note,
    destinationMessage:     note,
    remittanceInformation:  { value: note, type: 'UNSTRUCTURED' },
    creditor: { accountNumber: creditorIban, accountNumberType: 'IBAN' },
    market,
    ...(providerId ? { providerName: providerId } : {}),
  };

  const res = await fetch(`${TINK_BASE}/api/v1/payments/initiations?redirect_uri=${encodeURIComponent(redirectUri)}`, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`Tink initiate failed: ${res.status}`);
  return res.json() as Promise<TinkPaymentInitiateResponse>;
}

export async function tinkGetPaymentStatus(
  clientId: string,
  clientSecret: string,
  paymentId: string,
): Promise<TinkPaymentStatusResponse> {
  const token = await getClientToken(clientId, clientSecret);

  const res = await fetch(`${TINK_BASE}/api/v1/payments/initiations/${paymentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) throw new Error(`Tink status fetch failed: ${res.status}`);
  return res.json() as Promise<TinkPaymentStatusResponse>;
}

/** Map Tink's enum → our internal SplitRequestStatus */
export function tinkStatusToInternal(
  status: TinkPaymentStatus,
): 'authorized' | 'pending' | 'completed' | 'declined' | 'expired' {
  switch (status) {
    case 'PAID':
      return 'completed';
    case 'AUTHENTICATED':
    case 'INITIATED':
      return 'authorized';
    case 'PENDING':
    case 'USER_AUTHORIZATION_REQUIRED':
    case 'CREATED':
      return 'pending';
    case 'REJECTED':
    case 'CANCELLED':
      return 'declined';
    default:
      return 'pending';
  }
}
