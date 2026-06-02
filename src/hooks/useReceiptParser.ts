import { useState, useCallback } from 'react';
import { useService } from '../core/di/ServiceContext';
import { RECEIPT_PARSER } from '../core/di/tokens';
import { logger } from '../core/utils/logger';
import type { ParsedReceipt } from '../core/models/ParsedReceipt';

export type UseReceiptParserResult = {
  parseReceipt: (imageBase64: string, mimeType: 'image/jpeg' | 'image/png') => Promise<ParsedReceipt | null>;
  parsing: boolean;
  error: string | null;
  clearError: () => void;
};

export function useReceiptParser(): UseReceiptParserResult {
  const parser = useService(RECEIPT_PARSER);
  const [parsing, setParsing] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const parseReceipt = useCallback(async (
    imageBase64: string,
    mimeType: 'image/jpeg' | 'image/png',
  ): Promise<ParsedReceipt | null> => {
    setParsing(true);
    setError(null);
    try {
      const result = await parser.parseReceipt(imageBase64, mimeType);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not read receipt';
      logger.error('[useReceiptParser] failed:', message);
      setError(message.replace('RECEIPT_PARSE_FAILED: ', ''));
      return null;
    } finally {
      setParsing(false);
    }
  }, [parser]);

  const clearError = useCallback(() => setError(null), []);

  return { parseReceipt, parsing, error, clearError };
}
