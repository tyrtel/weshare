import type { IReceiptParser } from '../core/interfaces/IReceiptParser';
import type { ParsedReceipt } from '../core/models/ParsedReceipt';

export class MockReceiptParserService implements IReceiptParser {
  // Records the first 16 chars of each imageBase64 passed in, for test assertions.
  readonly calls: string[] = [];

  mockResult: ParsedReceipt = {
    merchant:         'Café de Flore',
    date:             '2026-05-14',
    currency:         'EUR',
    totalAmountCents: 4750,
    lineItems: [
      { description: 'Croque Monsieur',  amountCents: 1600 },
      { description: 'Café au lait x2', amountCents: 1400 },
      { description: 'Tarte Tatin',      amountCents: 1750 },
    ],
  };

  shouldFail = false;

  async parseReceipt(imageBase64: string, _mimeType: 'image/jpeg' | 'image/png'): Promise<ParsedReceipt> {
    this.calls.push(imageBase64.slice(0, 16));
    if (this.shouldFail) throw new Error('RECEIPT_PARSE_FAILED: Mock failure');
    return { ...this.mockResult, lineItems: [...this.mockResult.lineItems] };
  }
}
