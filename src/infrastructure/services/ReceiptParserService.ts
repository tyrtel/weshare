import type { IReceiptParser } from '../../core/interfaces/IReceiptParser';
import type { ParsedReceipt } from '../../core/models/ParsedReceipt';
import { supabase } from '../supabase/supabaseClient';
import { logger } from '../../core/utils/logger';

export class ReceiptParserService implements IReceiptParser {
  async parseReceipt(
    imageBase64: string,
    mimeType: 'image/jpeg' | 'image/png',
  ): Promise<ParsedReceipt> {
    logger.log('[ReceiptParser] invoking parse-receipt Edge Function', { mimeType, base64Length: imageBase64.length });

    const { data, error } = await supabase.functions.invoke<ParsedReceipt>('parse-receipt', {
      body: { imageBase64, mimeType },
    });

    if (error) {
      // supabase-js wraps HTTP error responses in a FunctionsHttpError with a
      // `context` property that contains the response object.
      const context = (error as { context?: Response }).context;
      if (context) {
        const status  = context.status;
        const rawText = await context.text().catch(() => '');
        let body: { error?: string } = {};
        try { body = JSON.parse(rawText); } catch { /* not JSON */ }
        logger.error('[ReceiptParser] Edge Function error:', { status, body: rawText });

        if (status === 401) throw new Error('RECEIPT_PARSE_FAILED: Not signed in');
        if (status === 429) throw new Error(`RECEIPT_PARSE_FAILED: ${body.error ?? 'Rate limit exceeded'}`);
        throw new Error(`RECEIPT_PARSE_FAILED: ${body.error ?? `HTTP ${status}`}`);
      }
      logger.error('[ReceiptParser] invocation error:', error.message);
      throw new Error(`RECEIPT_PARSE_FAILED: ${error.message}`);
    }

    if (!data) throw new Error('RECEIPT_PARSE_FAILED: Empty response from Edge Function');

    logger.log('[ReceiptParser] success:', {
      merchant:  data.merchant,
      total:     data.totalAmountCents,
      lineItems: data.lineItems?.length ?? 0,
    });
    return data;
  }
}
