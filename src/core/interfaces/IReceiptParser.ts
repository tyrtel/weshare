import type { ParsedReceipt } from '../models/ParsedReceipt';

export interface IReceiptParser {
  // tripId scopes the server-side OCR usage gate to a trip pass covering that
  // trip (TODO_monetization.md Chunk E) — omit for group-mode expenses, which
  // have no trip pass concept and fall straight to the free-tier/subscription
  // check.
  parseReceipt(imageBase64: string, mimeType: 'image/jpeg' | 'image/png', tripId?: string): Promise<ParsedReceipt>;
}
