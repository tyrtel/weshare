import type { IReceiptStorage } from '../core/interfaces/IReceiptStorage';

export class MockReceiptStorage implements IReceiptStorage {
  readonly uploads: Array<{ path: string; userId: string; expenseId: string }> = [];

  async uploadReceipt(
    _imageBase64: string,
    mimeType: 'image/jpeg' | 'image/png',
    userId: string,
    expenseId: string,
  ): Promise<string> {
    const ext  = mimeType === 'image/png' ? 'png' : 'jpg';
    const path = `${userId}/${expenseId}.${ext}`;
    this.uploads.push({ path, userId, expenseId });
    return path;
  }

  async getReceiptUrl(storagePath: string): Promise<string> {
    return `https://mock-storage.example.com/${storagePath}?token=mock`;
  }
}
