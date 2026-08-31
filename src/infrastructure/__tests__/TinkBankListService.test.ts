let mockExtra: Record<string, unknown> = {};

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() { return { extra: mockExtra }; },
  },
}));

import { TinkBankListService } from '../services/TinkBankListService';
import { getErrorMessage } from '../../core/types/AppError';

function tokenResponse(overrides: Record<string, unknown> = {}) {
  return { ok: true, status: 200, json: jest.fn().mockResolvedValue({ access_token: 'tink-token', ...overrides }) };
}

function providersResponse(providers: Array<Record<string, unknown>>) {
  return { ok: true, status: 200, json: jest.fn().mockResolvedValue({ providers }) };
}

// The service caches successful lookups per market in a module-level Map
// with no way to clear it from outside, so every test below uses its own
// unique, never-repeated market string — otherwise a later test would
// silently get an earlier test's cached result instead of hitting fetch.
let marketCounter = 0;
function uniqueMarket(): string { return `zz${++marketCounter}`; }

beforeEach(() => {
  jest.clearAllMocks();
  mockExtra = { tinkClientId: 'client-id', tinkClientSecret: 'client-secret' };
  global.fetch = jest.fn();
});

describe('TinkBankListService — getBanks', () => {
  it('fetches a token then the provider list, and maps providers to banks', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(providersResponse([
        { name: 'BNP Paribas', financialInstitutionId: 'bnp', iconUrl: 'https://icon/bnp.png' },
        { name: 'Société Générale', financialInstitutionId: 'sg' },
      ]));

    const market = uniqueMarket();
    const result = await new TinkBankListService().getBanks(market);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([
        { id: 'bnp', name: 'BNP Paribas', logoUrl: 'https://icon/bnp.png' },
        { id: 'sg', name: 'Société Générale', logoUrl: null },
      ]);
    }

    const [tokenUrl, tokenInit] = (global.fetch as jest.Mock).mock.calls[0];
    expect(tokenUrl).toBe('https://api.tink.com/api/v1/oauth/token');
    expect(tokenInit.method).toBe('POST');

    const [providersUrl, providersInit] = (global.fetch as jest.Mock).mock.calls[1];
    expect(providersUrl).toBe(`https://api.tink.com/api/v1/providers/${market.toUpperCase()}?financialServices=PAYMENT`);
    expect(providersInit.headers.Authorization).toBe('Bearer tink-token');
  });

  it('uppercases the market code in the providers URL', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(providersResponse([]));

    await new TinkBankListService().getBanks('se');

    const [providersUrl] = (global.fetch as jest.Mock).mock.calls[1];
    expect(providersUrl).toContain('/providers/SE');
  });

  it('treats a missing providers field as an empty bank list', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce({ ok: true, status: 200, json: jest.fn().mockResolvedValue({}) });

    const result = await new TinkBankListService().getBanks('fr-empty');

    expect(result).toEqual({ ok: true, value: [] });
  });

  it('returns a NetworkError when Tink credentials are not configured', async () => {
    mockExtra = {};
    delete process.env.EXPO_PUBLIC_TINK_CLIENT_ID;
    delete process.env.EXPO_PUBLIC_TINK_CLIENT_SECRET;

    const result = await new TinkBankListService().getBanks('fr-noconfig');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NetworkError');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('falls back to env vars when expoConfig.extra has no Tink credentials', async () => {
    mockExtra = {};
    process.env.EXPO_PUBLIC_TINK_CLIENT_ID = 'env-client-id';
    process.env.EXPO_PUBLIC_TINK_CLIENT_SECRET = 'env-client-secret';
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(providersResponse([]));

    const result = await new TinkBankListService().getBanks('fr-env');

    expect(result.ok).toBe(true);
    delete process.env.EXPO_PUBLIC_TINK_CLIENT_ID;
    delete process.env.EXPO_PUBLIC_TINK_CLIENT_SECRET;
  });

  it('returns a NetworkError when the token request fails', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 401 });

    const result = await new TinkBankListService().getBanks('fr-tokenfail');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NetworkError');
  });

  it('returns a NetworkError when the provider list request fails', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce({ ok: false, status: 500 });

    const result = await new TinkBankListService().getBanks('fr-listfail');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('NetworkError');
      expect(getErrorMessage(result.error)).toContain('500');
    }
  });

  it('returns a NetworkError when fetch throws (offline)', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('offline'));

    const result = await new TinkBankListService().getBanks('fr-throws');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(getErrorMessage(result.error)).toBe('offline');
  });

  it('serves the second call for the same market from cache without hitting the network again', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(providersResponse([{ name: 'Bank', financialInstitutionId: 'b1' }]));

    const service = new TinkBankListService();
    const first = await service.getBanks('de');
    const callCountAfterFirst = (global.fetch as jest.Mock).mock.calls.length;
    const second = await service.getBanks('de');

    expect(first).toEqual(second);
    expect((global.fetch as jest.Mock).mock.calls.length).toBe(callCountAfterFirst);
  });

  it('does not share cache across different markets', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(providersResponse([{ name: 'Bank DE', financialInstitutionId: 'de1' }]))
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(providersResponse([{ name: 'Bank AT', financialInstitutionId: 'at1' }]));

    const service = new TinkBankListService();
    const de = await service.getBanks('de-unique');
    const at = await service.getBanks('at-unique');

    expect(de).not.toEqual(at);
    expect(global.fetch).toHaveBeenCalledTimes(4);
  });
});
