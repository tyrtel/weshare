import Constants from 'expo-constants';
import { ok, err } from '../../core/types/Result';
import type { Result } from '../../core/types/Result';
import type { AppError } from '../../core/types/AppError';
import type { IBankListService, Bank } from '../../core/interfaces/IBankListService';

const TINK_API_BASE = 'https://api.tink.com';
const CACHE_TTL_MS  = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry {
  banks:     Bank[];
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

async function getTinkAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const res = await fetch(`${TINK_API_BASE}/api/v1/oauth/token`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      client_id:     clientId,
      client_secret: clientSecret,
      grant_type:    'client_credentials',
      scope:         'payment:read',
    }),
  });
  if (!res.ok) throw new Error(`Tink token request failed: ${res.status}`);
  const data = await res.json() as { access_token: string };
  return data.access_token;
}

export class TinkBankListService implements IBankListService {
  private readonly clientId:     string;
  private readonly clientSecret: string;

  constructor() {
    const extra        = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
    this.clientId     = (extra?.tinkClientId     as string | undefined) ?? process.env.EXPO_PUBLIC_TINK_CLIENT_ID     ?? '';
    this.clientSecret = (extra?.tinkClientSecret as string | undefined) ?? process.env.EXPO_PUBLIC_TINK_CLIENT_SECRET ?? '';
  }

  async getBanks(market: string): Promise<Result<Bank[], AppError>> {
    const cached = cache.get(market);
    if (cached && Date.now() < cached.expiresAt) return ok(cached.banks);

    if (!this.clientId || !this.clientSecret) {
      return err({ kind: 'NotFound', message: 'Tink credentials not configured' });
    }

    try {
      const token = await getTinkAccessToken(this.clientId, this.clientSecret);

      const res = await fetch(
        `${TINK_API_BASE}/api/v1/providers/${market.toUpperCase()}?financialServices=PAYMENT`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (!res.ok) return err({ kind: 'NetworkError', message: `Tink bank list failed: ${res.status}` });

      const data = await res.json() as {
        providers?: Array<{ name: string; financialInstitutionId: string; iconUrl?: string }>;
      };

      const banks: Bank[] = (data.providers ?? []).map((p) => ({
        id:      p.financialInstitutionId,
        name:    p.name,
        logoUrl: p.iconUrl ?? null,
      }));

      cache.set(market, { banks, expiresAt: Date.now() + CACHE_TTL_MS });
      return ok(banks);
    } catch (error) {
      return err({ kind: 'NetworkError', message: error instanceof Error ? error.message : 'Tink bank list error' });
    }
  }
}
