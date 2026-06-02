import type { ParsedReceipt } from '../models/ParsedReceipt';

export interface IReceiptParser {
  parseReceipt(imageBase64: string, mimeType: 'image/jpeg' | 'image/png'): Promise<ParsedReceipt>;
}
