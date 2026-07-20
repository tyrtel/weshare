import { useState, useCallback } from 'react';
import { useService } from '../core/di/ServiceContext';
import { RECEIPT_PARSER } from '../core/di/tokens';
import { logger } from '../core/utils/logger';
import type { ParsedReceipt } from '../core/models/ParsedReceipt';

export type UseReceiptParserResult = {
  parseReceipt: (imageBase64: string, mimeType: 'image/jpeg' | 'image/png', tripId?: string) => Promise<ParsedReceipt | null>;
  parsing: boolean;
  error: string | null;
  // Set instead of `error` when the server rejected the scan for having hit
  // the free-tier OCR cap (TODO_monetization.md Chunk E) — callers show a
  // paywall for this case rather than the generic error banner.
  limitReached: boolean;
  clearError: () => void;
};

export function useReceiptParser(): UseReceiptParserResult {
  const parser = useService(RECEIPT_PARSER);
  const [parsing, setParsing]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);

  const parseReceipt = useCallback(async (
    imageBase64: string,
    mimeType: 'image/jpeg' | 'image/png',
    tripId?: string,
  ): Promise<ParsedReceipt | null> => {
    setParsing(true);
    setError(null);
    setLimitReached(false);
    try {
      const result = await parser.parseReceipt(imageBase64, mimeType, tripId);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not read receipt';
      if (message === 'OCR_LIMIT_REACHED') {
        setLimitReached(true);
        return null;
      }
      logger.error('[useReceiptParser] failed:', message);
      setError(message.replace('RECEIPT_PARSE_FAILED: ', ''));
      return null;
    } finally {
      setParsing(false);
    }
  }, [parser]);

  const clearError = useCallback(() => {
    setError(null);
    setLimitReached(false);
  }, []);

  return { parseReceipt, parsing, error, limitReached, clearError };
}
