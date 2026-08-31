jest.mock('../supabase/supabaseClient', () => ({
  supabase: { functions: { invoke: jest.fn() } },
}));

jest.mock('../../core/utils/logger', () => ({
  logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { ReceiptParserService } from '../services/ReceiptParserService';

const { supabase } = require('../supabase/supabaseClient') as { supabase: { functions: { invoke: jest.Mock } } };

function response(overrides: Record<string, unknown> = {}) {
  return {
    merchant: 'Le Bistrot',
    totalAmountCents: 4599,
    lineItems: [{ label: 'Steak frites', amountCents: 2500 }, { label: 'Vin rouge', amountCents: 2099 }],
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ReceiptParserService — parseReceipt', () => {
  it('invokes the parse-receipt Edge Function with the image and returns the parsed receipt', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: response(), error: null });

    const result = await new ReceiptParserService().parseReceipt('base64img', 'image/jpeg', 't1');

    expect(supabase.functions.invoke).toHaveBeenCalledWith('parse-receipt', {
      body: { imageBase64: 'base64img', mimeType: 'image/jpeg', tripId: 't1' },
    });
    expect(result.merchant).toBe('Le Bistrot');
    expect(result.lineItems).toHaveLength(2);
  });

  it('omits tripId when not provided', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: response(), error: null });

    await new ReceiptParserService().parseReceipt('base64img', 'image/png');

    expect(supabase.functions.invoke).toHaveBeenCalledWith('parse-receipt', {
      body: { imageBase64: 'base64img', mimeType: 'image/png', tripId: undefined },
    });
  });

  it('throws OCR_LIMIT_REACHED on a 402 response (paywall)', async () => {
    supabase.functions.invoke.mockResolvedValue({
      data: null,
      error: {
        message: 'non-2xx',
        context: { status: 402, text: jest.fn().mockResolvedValue('{"error":"limit reached"}') },
      },
    });

    await expect(new ReceiptParserService().parseReceipt('base64img', 'image/jpeg'))
      .rejects.toThrow('OCR_LIMIT_REACHED');
  });

  it('throws a specific message on a 401 (not signed in)', async () => {
    supabase.functions.invoke.mockResolvedValue({
      data: null,
      error: { message: 'non-2xx', context: { status: 401, text: jest.fn().mockResolvedValue('{}') } },
    });

    await expect(new ReceiptParserService().parseReceipt('base64img', 'image/jpeg'))
      .rejects.toThrow('RECEIPT_PARSE_FAILED: Not signed in');
  });

  it('surfaces the server error message on a 429 (rate limit)', async () => {
    supabase.functions.invoke.mockResolvedValue({
      data: null,
      error: { message: 'non-2xx', context: { status: 429, text: jest.fn().mockResolvedValue('{"error":"Too many scans"}') } },
    });

    await expect(new ReceiptParserService().parseReceipt('base64img', 'image/jpeg'))
      .rejects.toThrow('RECEIPT_PARSE_FAILED: Too many scans');
  });

  it('falls back to a generic rate-limit message when the 429 body has no error field', async () => {
    supabase.functions.invoke.mockResolvedValue({
      data: null,
      error: { message: 'non-2xx', context: { status: 429, text: jest.fn().mockResolvedValue('{}') } },
    });

    await expect(new ReceiptParserService().parseReceipt('base64img', 'image/jpeg'))
      .rejects.toThrow('RECEIPT_PARSE_FAILED: Rate limit exceeded');
  });

  it('falls back to the HTTP status for any other status code', async () => {
    supabase.functions.invoke.mockResolvedValue({
      data: null,
      error: { message: 'non-2xx', context: { status: 500, text: jest.fn().mockResolvedValue('not json') } },
    });

    await expect(new ReceiptParserService().parseReceipt('base64img', 'image/jpeg'))
      .rejects.toThrow('RECEIPT_PARSE_FAILED: HTTP 500');
  });

  it('falls back to error.message when there is no response context (network failure)', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } });

    await expect(new ReceiptParserService().parseReceipt('base64img', 'image/jpeg'))
      .rejects.toThrow('RECEIPT_PARSE_FAILED: Failed to fetch');
  });

  it('throws when the function reports no error but sends no data', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: null, error: null });

    await expect(new ReceiptParserService().parseReceipt('base64img', 'image/jpeg'))
      .rejects.toThrow('RECEIPT_PARSE_FAILED: Empty response from Edge Function');
  });

  it('does not throw when reading the error response body itself fails', async () => {
    supabase.functions.invoke.mockResolvedValue({
      data: null,
      error: { message: 'non-2xx', context: { status: 500, text: jest.fn().mockRejectedValue(new Error('body already read')) } },
    });

    await expect(new ReceiptParserService().parseReceipt('base64img', 'image/jpeg'))
      .rejects.toThrow('RECEIPT_PARSE_FAILED: HTTP 500');
  });
});
