jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}));

jest.mock('expo-linking', () => ({
  createURL: jest.fn((path: string) => `ouishare:/${path}`),
}));

import { NativeShareService } from '../services/NativeShareService';

const Sharing = require('expo-sharing') as {
  isAvailableAsync: jest.Mock;
  shareAsync: jest.Mock;
};

describe('NativeShareService', () => {
  let service: NativeShareService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new NativeShareService();
  });

  it('returns ok(undefined) when sharing succeeds', async () => {
    Sharing.isAvailableAsync.mockResolvedValue(true);
    Sharing.shareAsync.mockResolvedValue(undefined);

    const result = await service.shareTrip('t1', 'Chez Paul');
    expect(result.ok).toBe(true);
  });

  it('calls shareAsync with the invite deep-link URL', async () => {
    Sharing.isAvailableAsync.mockResolvedValue(true);
    Sharing.shareAsync.mockResolvedValue(undefined);

    await service.shareTrip('t1', 'Chez Paul');
    expect(Sharing.shareAsync).toHaveBeenCalledWith(
      'ouishare://join/t1',
      expect.objectContaining({ dialogTitle: 'Invite to Chez Paul' }),
    );
  });

  it('returns NetworkError when sharing is not available', async () => {
    Sharing.isAvailableAsync.mockResolvedValue(false);

    const result = await service.shareTrip('t1', 'Road Trip');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('NetworkError');
    }
  });

  it('returns NetworkError when shareAsync throws', async () => {
    Sharing.isAvailableAsync.mockResolvedValue(true);
    Sharing.shareAsync.mockRejectedValue(new Error('user cancelled'));

    const result = await service.shareTrip('t1', 'Weekend');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('NetworkError');
      if (result.error.kind === 'NetworkError') {
        expect(result.error.message).toContain('user cancelled');
      }
    }
  });
});
