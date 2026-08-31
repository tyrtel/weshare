jest.mock('../supabase/supabaseClient', () => ({
  supabase: { from: jest.fn(), rpc: jest.fn() },
}));

import { SupabaseGroupRepository } from '../supabase/SupabaseGroupRepository';
import { mockChain } from '../../__testUtils__/supabaseMockChain';
import type { Group } from '../../core/models/Group';
import type { GroupMember } from '../../core/models/GroupMember';

const { supabase } = require('../supabase/supabaseClient') as {
  supabase: { from: jest.Mock; rpc: jest.Mock };
};

function groupMemberRow(overrides: Record<string, unknown> = {}) {
  return {
    group_id:     'g1',
    user_id:      'jay',
    display_name: 'Jay',
    is_guest:     false,
    joined_at:    '2026-07-01T12:00:00.000Z',
    phone:        null,
    email:        null,
    avatar_url:   null,
    ...overrides,
  };
}

function groupRow(overrides: Record<string, unknown> = {}) {
  return {
    id:           'g1',
    name:         'Roomies',
    currency:     'EUR',
    owner_id:     'jay',
    created_at:   '2026-07-01T12:00:00.000Z',
    invite_token: 'tok123',
    group_members: [groupMemberRow()],
    ...overrides,
  };
}

function group(overrides: Partial<Group> = {}): Group {
  return {
    id:          'g1',
    name:        'Roomies',
    currency:    'EUR',
    ownerId:     'jay',
    createdAt:   new Date('2026-07-01T12:00:00.000Z'),
    inviteToken: 'tok123',
    members:     [],
    ...overrides,
  };
}

function groupMember(overrides: Partial<GroupMember> = {}): GroupMember {
  return {
    userId:      'jay',
    groupId:     'g1',
    displayName: 'Jay',
    isGuest:     false,
    joinedAt:    new Date('2026-07-01T12:00:00.000Z'),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('SupabaseGroupRepository — getGroup', () => {
  it('maps a group row with its embedded members', async () => {
    supabase.from.mockReturnValue(mockChain({ data: groupRow(), error: null }));

    const result = await new SupabaseGroupRepository().getGroup('g1');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.id).toBe('g1');
      expect(result.value.name).toBe('Roomies');
      expect(result.value.inviteToken).toBe('tok123');
      expect(result.value.members).toHaveLength(1);
      expect(result.value.members[0].displayName).toBe('Jay');
      expect(result.value.createdAt).toBeInstanceOf(Date);
    }
  });

  it('defaults to an empty member list when group_members is absent', async () => {
    const row = groupRow();
    delete (row as Record<string, unknown>).group_members;
    supabase.from.mockReturnValue(mockChain({ data: row, error: null }));

    const result = await new SupabaseGroupRepository().getGroup('g1');

    if (result.ok) expect(result.value.members).toEqual([]);
  });

  it('wraps a PGRST116 error as NotFoundError', async () => {
    supabase.from.mockReturnValue(
      mockChain({ data: null, error: { message: 'no rows', code: 'PGRST116' } }),
    );

    const result = await new SupabaseGroupRepository().getGroup('missing');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NotFoundError');
  });
});

describe('SupabaseGroupRepository — getGroupsForUser', () => {
  it('merges groups the user owns with groups they are a member of', async () => {
    supabase.from
      .mockReturnValueOnce(mockChain({ data: [groupRow({ id: 'owned1' })], error: null }))
      .mockReturnValueOnce(mockChain({ data: [groupRow({ id: 'membered1' })], error: null }));

    const result = await new SupabaseGroupRepository().getGroupsForUser('jay');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.map(g => g.id).sort()).toEqual(['membered1', 'owned1']);
    }
  });

  it('deduplicates a group that appears in both result sets', async () => {
    supabase.from
      .mockReturnValueOnce(mockChain({ data: [groupRow({ id: 'g1' })], error: null }))
      .mockReturnValueOnce(mockChain({ data: [groupRow({ id: 'g1' })], error: null }));

    const result = await new SupabaseGroupRepository().getGroupsForUser('jay');

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(1);
  });

  it('returns an error when the owned-groups query fails, without waiting on the membered one', async () => {
    supabase.from
      .mockReturnValueOnce(mockChain({ data: null, error: { message: 'owned query failed' } }))
      .mockReturnValueOnce(mockChain({ data: [], error: null }));

    const result = await new SupabaseGroupRepository().getGroupsForUser('jay');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NetworkError');
  });

  it('returns an error when the membered-groups query fails', async () => {
    supabase.from
      .mockReturnValueOnce(mockChain({ data: [], error: null }))
      .mockReturnValueOnce(mockChain({ data: null, error: { message: 'membered query failed' } }));

    const result = await new SupabaseGroupRepository().getGroupsForUser('jay');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NetworkError');
  });
});

describe('SupabaseGroupRepository — getGroupByInviteToken', () => {
  it('maps the matching group', async () => {
    supabase.from.mockReturnValue(mockChain({ data: groupRow({ invite_token: 'abc123' }), error: null }));

    const result = await new SupabaseGroupRepository().getGroupByInviteToken('abc123');

    if (result.ok) expect(result.value.inviteToken).toBe('abc123');
  });

  it('wraps a PGRST116 error as NotFoundError', async () => {
    supabase.from.mockReturnValue(
      mockChain({ data: null, error: { message: 'no rows', code: 'PGRST116' } }),
    );

    const result = await new SupabaseGroupRepository().getGroupByInviteToken('no-such-token');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NotFoundError');
  });
});

describe('SupabaseGroupRepository — saveGroup', () => {
  it('inserts the group only when there are no members to insert', async () => {
    supabase.from.mockReturnValue(mockChain({ data: null, error: null }));

    const result = await new SupabaseGroupRepository().saveGroup(group({ members: [] }));

    expect(result.ok).toBe(true);
    expect(supabase.from).toHaveBeenCalledTimes(1);
    expect(supabase.from).toHaveBeenCalledWith('groups');
  });

  it('inserts both the group and its members when members are present', async () => {
    supabase.from
      .mockReturnValueOnce(mockChain({ data: null, error: null }))
      .mockReturnValueOnce(mockChain({ data: null, error: null }));

    const result = await new SupabaseGroupRepository().saveGroup(
      group({ members: [groupMember()] }),
    );

    expect(result.ok).toBe(true);
    expect(supabase.from).toHaveBeenCalledTimes(2);
    expect(supabase.from).toHaveBeenNthCalledWith(1, 'groups');
    expect(supabase.from).toHaveBeenNthCalledWith(2, 'group_members');
  });

  it('returns an error and never attempts the member insert when the group insert fails', async () => {
    supabase.from.mockReturnValue(mockChain({ data: null, error: { message: 'duplicate group id' } }));

    const result = await new SupabaseGroupRepository().saveGroup(
      group({ members: [groupMember()] }),
    );

    expect(result.ok).toBe(false);
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });

  it('returns an error when the member insert fails', async () => {
    supabase.from
      .mockReturnValueOnce(mockChain({ data: null, error: null }))
      .mockReturnValueOnce(mockChain({ data: null, error: { message: 'member insert failed' } }));

    const result = await new SupabaseGroupRepository().saveGroup(
      group({ members: [groupMember()] }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NetworkError');
  });
});

describe('SupabaseGroupRepository — updateGroup', () => {
  it('updates and returns the mapped group', async () => {
    supabase.from.mockReturnValue(mockChain({ data: groupRow({ name: 'New Name' }), error: null }));

    const result = await new SupabaseGroupRepository().updateGroup(group({ name: 'New Name' }));

    if (result.ok) expect(result.value.name).toBe('New Name');
  });

  it('wraps a Supabase error as NetworkError', async () => {
    supabase.from.mockReturnValue(mockChain({ data: null, error: { message: 'update failed' } }));

    const result = await new SupabaseGroupRepository().updateGroup(group());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NetworkError');
  });
});

describe('SupabaseGroupRepository — deleteGroup', () => {
  it('returns ok on success', async () => {
    supabase.from.mockReturnValue(mockChain({ data: null, error: null }));

    const result = await new SupabaseGroupRepository().deleteGroup('g1');

    expect(result.ok).toBe(true);
  });

  it('returns a NetworkError on failure', async () => {
    supabase.from.mockReturnValue(mockChain({ data: null, error: { message: 'delete failed' } }));

    const result = await new SupabaseGroupRepository().deleteGroup('g1');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NetworkError');
  });
});

describe('SupabaseGroupRepository — addMember', () => {
  it('inserts and maps the new member', async () => {
    supabase.from.mockReturnValue(mockChain({ data: groupMemberRow({ user_id: 'marie', display_name: 'Marie' }), error: null }));

    const result = await new SupabaseGroupRepository().addMember(groupMember({ userId: 'marie', displayName: 'Marie' }));

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.displayName).toBe('Marie');
  });

  it('returns a NetworkError on failure', async () => {
    supabase.from.mockReturnValue(mockChain({ data: null, error: { message: 'insert failed' } }));

    const result = await new SupabaseGroupRepository().addMember(groupMember());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NetworkError');
  });
});

describe('SupabaseGroupRepository — findMemberByEmail', () => {
  it('maps the member when a row is found', async () => {
    supabase.from.mockReturnValue(mockChain({ data: groupMemberRow({ email: 'marie@example.com' }), error: null }));

    const result = await new SupabaseGroupRepository().findMemberByEmail('g1', 'marie@example.com');

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value?.email).toBe('marie@example.com');
  });

  it('returns ok(null) when no row matches', async () => {
    supabase.from.mockReturnValue(mockChain({ data: null, error: null }));

    const result = await new SupabaseGroupRepository().findMemberByEmail('g1', 'nobody@example.com');

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  });

  it('returns a NetworkError on failure', async () => {
    supabase.from.mockReturnValue(mockChain({ data: null, error: { message: 'query failed' } }));

    const result = await new SupabaseGroupRepository().findMemberByEmail('g1', 'marie@example.com');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NetworkError');
  });
});

describe('SupabaseGroupRepository — claimGroupMemberSlot', () => {
  it('runs the claim RPC then updates the display name and returns the mapped member', async () => {
    supabase.rpc.mockResolvedValue({ error: null });
    supabase.from.mockReturnValue(
      mockChain({ data: groupMemberRow({ user_id: 'newUser', display_name: 'New Name' }), error: null }),
    );

    const result = await new SupabaseGroupRepository().claimGroupMemberSlot('g1', 'placeholder1', 'newUser', 'New Name');

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.displayName).toBe('New Name');
    expect(supabase.rpc).toHaveBeenCalledWith('claim_group_member_slot', {
      p_group_id: 'g1',
      p_placeholder_user_id: 'placeholder1',
    });
  });

  it('returns an error and never runs the update when the RPC fails', async () => {
    supabase.rpc.mockResolvedValue({ error: { message: 'slot already claimed' } });

    const result = await new SupabaseGroupRepository().claimGroupMemberSlot('g1', 'placeholder1', 'newUser', 'New Name');

    expect(result.ok).toBe(false);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('synthesizes a NetworkError when the post-claim update finds no matching row', async () => {
    supabase.rpc.mockResolvedValue({ error: null });
    supabase.from.mockReturnValue(mockChain({ data: null, error: null }));

    const result = await new SupabaseGroupRepository().claimGroupMemberSlot('g1', 'placeholder1', 'newUser', 'New Name');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('NetworkError');
      if (result.error.kind === 'NetworkError') expect(result.error.message).toBe('Member not found after claim');
    }
  });
});

describe('SupabaseGroupRepository — updateMemberEmail', () => {
  it('updates and returns the mapped member', async () => {
    supabase.from.mockReturnValue(mockChain({ data: groupMemberRow({ email: 'new@example.com' }), error: null }));

    const result = await new SupabaseGroupRepository().updateMemberEmail('g1', 'jay', 'new@example.com');

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.email).toBe('new@example.com');
  });

  it('returns a NetworkError on failure', async () => {
    supabase.from.mockReturnValue(mockChain({ data: null, error: { message: 'update failed' } }));

    const result = await new SupabaseGroupRepository().updateMemberEmail('g1', 'jay', 'new@example.com');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NetworkError');
  });
});
