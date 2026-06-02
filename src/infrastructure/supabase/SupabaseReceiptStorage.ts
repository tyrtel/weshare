import { supabase } from './supabaseClient';
import type { IReceiptStorage } from '../../core/interfaces/IReceiptStorage';

const BUCKET = 'receipts';
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

export class SupabaseReceiptStorage implements IReceiptStorage {
  async uploadReceipt(
    imageBase64: string,
    mimeType: 'image/jpeg' | 'image/png',
    userId: string,
    expenseId: string,
  ): Promise<string> {
    const ext  = mimeType === 'image/png' ? 'png' : 'jpg';
    const path = `${userId}/${expenseId}.${ext}`;

    const binary = Uint8Array.from(atob(imageBase64), c => c.charCodeAt(0));

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, binary, { contentType: mimeType, upsert: true });

    if (error) throw new Error(`Receipt upload failed: ${error.message}`);
    return path;
  }

  async getReceiptUrl(storagePath: string): Promise<string> {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

    if (error || !data?.signedUrl) {
      throw new Error(`Could not get receipt URL: ${error?.message ?? 'unknown'}`);
    }
    return data.signedUrl;
  }
}
