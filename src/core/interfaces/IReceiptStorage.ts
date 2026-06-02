export interface IReceiptStorage {
  uploadReceipt(
    imageBase64: string,
    mimeType: 'image/jpeg' | 'image/png',
    userId: string,
    expenseId: string,
  ): Promise<string>;

  getReceiptUrl(storagePath: string): Promise<string>;
}
