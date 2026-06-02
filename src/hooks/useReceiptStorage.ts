import { useCallback } from 'react';
import { useService } from '../core/di/ServiceContext';
import { AUTH, RECEIPT_STORAGE } from '../core/di/tokens';
import { generateId } from '../core/utils/generateId';

export type UseReceiptStorageResult = {
  uploadReceipt: (
    imageBase64: string,
    mimeType: 'image/jpeg' | 'image/png',
  ) => Promise<string | null>;
  getReceiptUrl: (storagePath: string) => Promise<string | null>;
};

export function useReceiptStorage(): UseReceiptStorageResult {
  const auth           = useService(AUTH);
  const receiptStorage = useService(RECEIPT_STORAGE);

  const uploadReceipt = useCallback(async (
    imageBase64: string,
    mimeType: 'image/jpeg' | 'image/png',
  ): Promise<string | null> => {
    try {
      const userId    = auth.currentUser()?.id ?? 'anon';
      const receiptId = generateId();
      return await receiptStorage.uploadReceipt(imageBase64, mimeType, userId, receiptId);
    } catch {
      return null;
    }
  }, [auth, receiptStorage]);

  const getReceiptUrl = useCallback(async (storagePath: string): Promise<string | null> => {
    try {
      return await receiptStorage.getReceiptUrl(storagePath);
    } catch {
      return null;
    }
  }, [receiptStorage]);

  return { uploadReceipt, getReceiptUrl };
}
