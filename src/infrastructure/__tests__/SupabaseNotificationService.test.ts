jest.mock('../supabase/supabaseClient', () => ({
  supabase: { rpc: jest.fn(), from: jest.fn() },
}));

import { SupabaseNotificationService } from '../supabase/SupabaseNotificationService';
import { mockChain } from '../../__testUtils__/supabaseMockChain';

const { supabase } = require('../supabase/supabaseClient') as {
  supabase: { rpc: jest.Mock; from: jest.Mock };
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('SupabaseNotificationService — enqueue', () => {
  it('calls the enqueue RPC with snake_case params and a default maxAttempts of 5', async () => {
    supabase.rpc.mockResolvedValue({ error: null });

    await new SupabaseNotificationService().enqueue({
      userId:    'jay',
      channel:   'push',
      eventType: 'expense_settled',
      payload:   { tripId: 't1' },
    });

    expect(supabase.rpc).toHaveBeenCalledWith('enqueue_notification', {
      p_user_id:      'jay',
      p_channel:      'push',
      p_event_type:   'expense_settled',
      p_payload:      { tripId: 't1' },
      p_max_attempts: 5,
    });
  });

  it('passes through an explicit maxAttempts instead of the default', async () => {
    supabase.rpc.mockResolvedValue({ error: null });

    await new SupabaseNotificationService().enqueue({
      userId: 'jay', channel: 'email', eventType: 'payment_failed', payload: {}, maxAttempts: 1,
    });

    expect(supabase.rpc).toHaveBeenCalledWith('enqueue_notification', expect.objectContaining({
      p_max_attempts: 1,
    }));
  });

  it('throws when the RPC reports an error', async () => {
    supabase.rpc.mockResolvedValue({ error: { message: 'queue depth exceeded' } });

    await expect(
      new SupabaseNotificationService().enqueue({
        userId: 'jay', channel: 'push', eventType: 'group_invite', payload: {},
      }),
    ).rejects.toThrow('queue depth exceeded');
  });
});

describe('SupabaseNotificationService — registerDeviceToken', () => {
  it('upserts the token, ignoring duplicates on (user_id, token)', async () => {
    const chain = mockChain({ data: null, error: null });
    supabase.from.mockReturnValue(chain);

    await new SupabaseNotificationService().registerDeviceToken('jay', 'tok_abc', 'ios');

    expect(supabase.from).toHaveBeenCalledWith('device_tokens');
  });

  it('throws when the upsert fails', async () => {
    supabase.from.mockReturnValue(mockChain({ data: null, error: { message: 'upsert failed' } }));

    await expect(
      new SupabaseNotificationService().registerDeviceToken('jay', 'tok_abc', 'android'),
    ).rejects.toThrow('upsert failed');
  });
});

describe('SupabaseNotificationService — unregisterDeviceToken', () => {
  it('deletes the token row', async () => {
    supabase.from.mockReturnValue(mockChain({ data: null, error: null }));

    await expect(
      new SupabaseNotificationService().unregisterDeviceToken('tok_abc'),
    ).resolves.toBeUndefined();
    expect(supabase.from).toHaveBeenCalledWith('device_tokens');
  });

  it('throws when the delete fails', async () => {
    supabase.from.mockReturnValue(mockChain({ data: null, error: { message: 'delete failed' } }));

    await expect(
      new SupabaseNotificationService().unregisterDeviceToken('tok_abc'),
    ).rejects.toThrow('delete failed');
  });
});
