jest.mock('../supabase/supabaseClient', () => ({
  supabase: { from: jest.fn(), rpc: jest.fn() },
}));

import { SupabaseMemberRepository } from '../supabase/SupabaseMemberRepository';
import { mockChain } from '../../__testUtils__/supabaseMockChain';
import type { TripMember } from '../../core/models/TripMember';

const { supabase } = require('../supabase/supabaseClient') as { supabase: { from: jest.Mock; rpc: jest.Mock } };

function memberRow(overrides: Record<string, unknown> = {}) {
  return {
    trip_id: 't1',
    user_id: 'u1',
    display_name: 'Marie',
    is_guest: false,
    joined_at: '2026-01-01T00:00:00.000Z',
    phone: null,
    email: null,
    avatar_url: null,
    ...overrides,
  };
}

function tripMember(overrides: Partial<TripMember> = {}): TripMember {
  return {
    tripId: 't1',
    userId: 'u1',
    displayName: 'Marie',
    isGuest: false,
    joinedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('SupabaseMemberRepository — getMembersForTrip', () => {
  it('maps every member row for the trip', async () => {
    supabase.from.mockReturnValue(mockChain({ data: [memberRow(), memberRow({ user_id: 'u2', display_name: 'Léo' })], error: null }));

    const result = await new SupabaseMemberRepository().getMembersForTrip('t1');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(2);
      expect(result.value[1].displayName).toBe('Léo');
    }
    expect(supabase.from).toHaveBeenCalledWith('trip_members');
  });

  it('returns an empty list rather than an error when the trip has no members', async () => {
    supabase.from.mockReturnValue(mockChain({ data: [], error: null }));

    const result = await new SupabaseMemberRepository().getMembersForTrip('t1');

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('includes optional phone/email/avatarUrl only when present', async () => {
    supabase.from.mockReturnValue(mockChain({ data: [memberRow({ phone: '+33600000000', email: 'marie@example.com' })], error: null }));

    const result = await new SupabaseMemberRepository().getMembersForTrip('t1');

    if (result.ok) {
      expect(result.value[0].phone).toBe('+33600000000');
      expect(result.value[0].email).toBe('marie@example.com');
      expect(result.value[0]).not.toHaveProperty('avatarUrl');
    }
  });

  it('returns a NetworkError when the query fails', async () => {
    supabase.from.mockReturnValue(mockChain({ data: null, error: { message: 'connection lost' } }));

    const result = await new SupabaseMemberRepository().getMembersForTrip('t1');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NetworkError');
  });
});

describe('SupabaseMemberRepository — addMember', () => {
  it('inserts the member and returns the row Supabase echoes back', async () => {
    supabase.from.mockReturnValue(mockChain({ data: memberRow(), error: null }));

    const result = await new SupabaseMemberRepository().addMember(tripMember());

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.displayName).toBe('Marie');
    expect(supabase.from).toHaveBeenCalledWith('trip_members');
  });

  it('returns a NetworkError when the insert fails', async () => {
    supabase.from.mockReturnValue(mockChain({ data: null, error: { message: 'duplicate key' } }));

    const result = await new SupabaseMemberRepository().addMember(tripMember());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NetworkError');
  });
});

describe('SupabaseMemberRepository — removeMember', () => {
  it('deletes the member row', async () => {
    supabase.from.mockReturnValue(mockChain({ data: null, error: null }));

    const result = await new SupabaseMemberRepository().removeMember('t1', 'u1');

    expect(result).toEqual({ ok: true, value: undefined });
    expect(supabase.from).toHaveBeenCalledWith('trip_members');
  });

  it('returns a NetworkError when the delete fails', async () => {
    supabase.from.mockReturnValue(mockChain({ data: null, error: { message: 'permission denied' } }));

    const result = await new SupabaseMemberRepository().removeMember('t1', 'u1');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NetworkError');
  });
});

describe('SupabaseMemberRepository — findMemberByEmail', () => {
  it('returns the matching member when found (case-insensitive)', async () => {
    supabase.from.mockReturnValue(mockChain({ data: memberRow({ email: 'marie@example.com' }), error: null }));

    const result = await new SupabaseMemberRepository().findMemberByEmail('t1', 'MARIE@example.com');

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value?.email).toBe('marie@example.com');
  });

  it('returns null (not an error) when no member matches', async () => {
    supabase.from.mockReturnValue(mockChain({ data: null, error: null }));

    const result = await new SupabaseMemberRepository().findMemberByEmail('t1', 'nobody@example.com');

    expect(result).toEqual({ ok: true, value: null });
  });

  it('returns a NetworkError when the query fails', async () => {
    supabase.from.mockReturnValue(mockChain({ data: null, error: { message: 'timeout' } }));

    const result = await new SupabaseMemberRepository().findMemberByEmail('t1', 'marie@example.com');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NetworkError');
  });
});

describe('SupabaseMemberRepository — claimMemberSlot', () => {
  it('calls the claim RPC then renames the claimed slot and returns it', async () => {
    supabase.rpc.mockResolvedValue({ error: null });
    supabase.from.mockReturnValue(mockChain({ data: memberRow({ user_id: 'real-u1', display_name: 'Marie Dupont' }), error: null }));

    const result = await new SupabaseMemberRepository().claimMemberSlot('t1', 'guest_abc', 'real-u1', 'Marie Dupont');

    expect(supabase.rpc).toHaveBeenCalledWith('claim_member_slot', { p_trip_id: 't1', p_placeholder_user_id: 'guest_abc' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.userId).toBe('real-u1');
      expect(result.value.displayName).toBe('Marie Dupont');
    }
  });

  it('returns a NetworkError without attempting the rename when the RPC fails', async () => {
    supabase.rpc.mockResolvedValue({ error: { message: 'already claimed' } });

    const result = await new SupabaseMemberRepository().claimMemberSlot('t1', 'guest_abc', 'real-u1', 'Marie');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NetworkError');
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('returns a NetworkError when the post-claim rename update fails', async () => {
    supabase.rpc.mockResolvedValue({ error: null });
    supabase.from.mockReturnValue(mockChain({ data: null, error: { message: 'row locked' } }));

    const result = await new SupabaseMemberRepository().claimMemberSlot('t1', 'guest_abc', 'real-u1', 'Marie');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NetworkError');
  });

  it('returns an error when the update reports no error but finds no row', async () => {
    supabase.rpc.mockResolvedValue({ error: null });
    supabase.from.mockReturnValue(mockChain({ data: null, error: null }));

    const result = await new SupabaseMemberRepository().claimMemberSlot('t1', 'guest_abc', 'real-u1', 'Marie');

    expect(result.ok).toBe(false);
  });
});
