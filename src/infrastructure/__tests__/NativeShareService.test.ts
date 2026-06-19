jest.mock('react-native', () => ({
  Share: {
    share: jest.fn(),
  },
}));

jest.mock('expo-linking', () => ({
  createURL: jest.fn((path: string) => `ouishare:/${path}`),
}));

import { NativeShareService } from '../services/NativeShareService';

const { Share } = require('react-native') as { Share: { share: jest.Mock } };

describe('NativeShareService', () => {
  let service: NativeShareService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new NativeShareService();
  });

  it('returns ok when sharing succeeds', async () => {
    Share.share.mockResolvedValue({ action: 'sharedAction' });

    const result = await service.shareTrip('t1', 'Chez Paul', 'tok_abc');
    expect(result.ok).toBe(true);
  });

  it('calls Share.share with a message containing the invite token URL', async () => {
    Share.share.mockResolvedValue({ action: 'sharedAction' });

    await service.shareTrip('t1', 'Chez Paul', 'tok_abc');
    expect(Share.share).toHaveBeenCalledWith({
      message: expect.stringContaining('ouishare://join/tok_abc'),
    });
  });

  it('includes the trip name in the share message', async () => {
    Share.share.mockResolvedValue({ action: 'sharedAction' });

    await service.shareTrip('t1', 'Road Trip', 'tok_xyz');
    expect(Share.share).toHaveBeenCalledWith({
      message: expect.stringContaining('Road Trip'),
    });
  });

  it('returns NetworkError when Share.share throws', async () => {
    Share.share.mockRejectedValue(new Error('user cancelled'));

    const result = await service.shareTrip('t1', 'Weekend', 'tok_123');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('NetworkError');
      expect(result.error.message).toContain('user cancelled');
    }
  });
});
