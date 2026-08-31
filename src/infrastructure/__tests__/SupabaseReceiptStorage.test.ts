jest.mock('../supabase/supabaseClient', () => ({
  supabase: { storage: { from: jest.fn() } },
}));

import { SupabaseReceiptStorage } from '../supabase/SupabaseReceiptStorage';

const { supabase } = require('../supabase/supabaseClient') as {
  supabase: { storage: { from: jest.Mock } };
};

function mockBucket(overrides: { upload?: jest.Mock; createSignedUrl?: jest.Mock } = {}) {
  const bucket = {
    upload:          overrides.upload ?? jest.fn().mockResolvedValue({ error: null }),
    createSignedUrl: overrides.createSignedUrl ?? jest.fn().mockResolvedValue({
      data: { signedUrl: 'https://signed.example/receipt.jpg' }, error: null,
    }),
  };
  supabase.storage.from.mockReturnValue(bucket);
  return bucket;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('SupabaseReceiptStorage — uploadReceipt', () => {
  it('uploads to the receipts bucket at a userId/expenseId.jpg path for JPEG', async () => {
    const bucket = mockBucket();
    const imageBase64 = btoa('hello jpeg bytes');

    const path = await new SupabaseReceiptStorage().uploadReceipt(imageBase64, 'image/jpeg', 'u1', 'e1');

    expect(path).toBe('u1/e1.jpg');
    expect(supabase.storage.from).toHaveBeenCalledWith('receipts');
    expect(bucket.upload).toHaveBeenCalledWith(
      'u1/e1.jpg',
      expect.any(Uint8Array),
      { contentType: 'image/jpeg', upsert: true },
    );
    const uploadedBytes = bucket.upload.mock.calls[0][1] as Uint8Array;
    expect(Buffer.from(uploadedBytes).toString('utf-8')).toBe('hello jpeg bytes');
  });

  it('uses a .png extension for PNG uploads', async () => {
    mockBucket();
    const path = await new SupabaseReceiptStorage().uploadReceipt(btoa('png bytes'), 'image/png', 'u1', 'e2');
    expect(path).toBe('u1/e2.png');
  });

  it('throws with the underlying message when the upload fails', async () => {
    mockBucket({ upload: jest.fn().mockResolvedValue({ error: { message: 'bucket quota exceeded' } }) });

    await expect(
      new SupabaseReceiptStorage().uploadReceipt(btoa('x'), 'image/jpeg', 'u1', 'e1'),
    ).rejects.toThrow('Receipt upload failed: bucket quota exceeded');
  });
});

describe('SupabaseReceiptStorage — getReceiptUrl', () => {
  it('returns the signed URL on success', async () => {
    mockBucket();
    const url = await new SupabaseReceiptStorage().getReceiptUrl('u1/e1.jpg');
    expect(url).toBe('https://signed.example/receipt.jpg');
  });

  it('throws when Supabase reports an error', async () => {
    mockBucket({ createSignedUrl: jest.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }) });

    await expect(
      new SupabaseReceiptStorage().getReceiptUrl('missing/path.jpg'),
    ).rejects.toThrow('Could not get receipt URL: not found');
  });

  it('throws a fallback message when there is no error but also no signedUrl', async () => {
    mockBucket({ createSignedUrl: jest.fn().mockResolvedValue({ data: {}, error: null }) });

    await expect(
      new SupabaseReceiptStorage().getReceiptUrl('u1/e1.jpg'),
    ).rejects.toThrow('Could not get receipt URL: unknown');
  });
});
