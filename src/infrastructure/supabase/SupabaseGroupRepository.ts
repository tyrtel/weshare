import { ok, err } from '../../core/types/Result';
import type { Result } from '../../core/types/Result';
import type { AppError } from '../../core/types/AppError';
import type { IGroupRepository } from '../../core/interfaces/IGroupRepository';
import type { Group } from '../../core/models/Group';
import type { GroupMember } from '../../core/models/GroupMember';
import { supabase } from './supabaseClient';
import { toAppError } from './supabaseErrors';
import { parseGroupRow, parseGroupMemberRow, mapRows } from './rowSchemas';

function rowToGroupMember(raw: unknown): Result<GroupMember, AppError> {
  const parsed = parseGroupMemberRow(raw);
  if (!parsed.ok) return parsed;
  const row = parsed.value;
  return ok({
    userId:      row.user_id,
    groupId:     row.group_id,
    displayName: row.display_name,
    isGuest:     row.is_guest,
    joinedAt:    new Date(row.joined_at),
    phone:       row.phone ?? undefined,
    email:       row.email ?? undefined,
    avatarUrl:   row.avatar_url ?? undefined,
  });
}

function rowToGroup(rawRow: unknown, rawMembers: unknown[]): Result<Group, AppError> {
  const parsedGroup = parseGroupRow(rawRow);
  if (!parsedGroup.ok) return parsedGroup;

  const membersResult = mapRows(rawMembers, rowToGroupMember);
  if (!membersResult.ok) return membersResult;

  const row = parsedGroup.value;
  return ok({
    id:          row.id,
    name:        row.name,
    currency:    row.currency,
    ownerId:     row.owner_id,
    createdAt:   new Date(row.created_at),
    inviteToken: row.invite_token ?? undefined,
    members:     membersResult.value,
  });
}

type RawGroupWithMembers = { group_members?: unknown[] } & Record<string, unknown>;

export class SupabaseGroupRepository implements IGroupRepository {
  async getGroup(id: string): Promise<Result<Group, AppError>> {
    const { data, error } = await supabase
      .from('groups')
      .select('*, group_members(*)')
      .eq('id', id)
      .single();
    if (error) return err(toAppError(error, 'Group', id));
    const raw = data as RawGroupWithMembers;
    return rowToGroup(raw, raw.group_members ?? []);
  }

  async getGroupsForUser(userId: string): Promise<Result<Group[], AppError>> {
    const [ownedRes, memberedRes] = await Promise.all([
      supabase.from('groups').select('*, group_members(*)').eq('owner_id', userId),
      supabase.from('groups').select('*, group_members!inner(*)').eq('group_members.user_id', userId).neq('owner_id', userId),
    ]);
    if (ownedRes.error)    return err(toAppError(ownedRes.error,    'Group'));
    if (memberedRes.error) return err(toAppError(memberedRes.error, 'Group'));

    const seen = new Set<string>();
    const groups: Group[] = [];
    for (const row of [...(ownedRes.data ?? []), ...(memberedRes.data ?? [])]) {
      const raw = row as RawGroupWithMembers;
      const id = raw['id'] as string;
      if (seen.has(id)) continue;
      seen.add(id);
      const result = rowToGroup(raw, raw.group_members ?? []);
      if (!result.ok) return result;
      groups.push(result.value);
    }
    return ok(groups);
  }

  async getGroupByInviteToken(token: string): Promise<Result<Group, AppError>> {
    const { data, error } = await supabase
      .from('groups')
      .select('*, group_members(*)')
      .eq('invite_token', token)
      .single();
    if (error) return err(toAppError(error, 'Group', token));
    const raw = data as RawGroupWithMembers;
    return rowToGroup(raw, raw.group_members ?? []);
  }

  async saveGroup(group: Group): Promise<Result<Group, AppError>> {
    const { error: groupError } = await supabase
      .from('groups')
      .insert({
        id:           group.id,
        name:         group.name,
        currency:     group.currency,
        owner_id:     group.ownerId,
        invite_token: group.inviteToken ?? null,
      });
    if (groupError) return err(toAppError(groupError, 'Group', group.id));

    if (group.members.length > 0) {
      const { error: memberError } = await supabase
        .from('group_members')
        .insert(
          group.members.map(m => ({
            user_id:      m.userId,
            group_id:     group.id,
            display_name: m.displayName,
            is_guest:     m.isGuest,
            joined_at:    m.joinedAt.toISOString(),
            phone:        m.phone ?? null,
            email:        m.email ?? null,
            avatar_url:   m.avatarUrl ?? null,
          })),
        );
      if (memberError) return err(toAppError(memberError, 'GroupMember', group.id));
    }

    return ok(group);
  }

  async updateGroup(group: Group): Promise<Result<Group, AppError>> {
    const { data, error } = await supabase
      .from('groups')
      .update({ name: group.name, currency: group.currency, invite_token: group.inviteToken ?? null })
      .eq('id', group.id)
      .select('*, group_members(*)')
      .single();
    if (error) return err(toAppError(error, 'Group', group.id));
    const raw = data as RawGroupWithMembers;
    return rowToGroup(raw, raw.group_members ?? []);
  }

  async deleteGroup(id: string): Promise<Result<void, AppError>> {
    const { error } = await supabase.from('groups').delete().eq('id', id);
    if (error) return err(toAppError(error, 'Group', id));
    return ok(undefined);
  }

  async addMember(member: GroupMember): Promise<Result<GroupMember, AppError>> {
    const { data, error } = await supabase
      .from('group_members')
      .insert({
        user_id:      member.userId,
        group_id:     member.groupId,
        display_name: member.displayName,
        is_guest:     member.isGuest,
        joined_at:    member.joinedAt.toISOString(),
        phone:        member.phone ?? null,
        email:        member.email ?? null,
        avatar_url:   member.avatarUrl ?? null,
      })
      .select()
      .single();
    if (error) return err(toAppError(error, 'GroupMember', member.userId));
    return rowToGroupMember(data);
  }

  async findMemberByEmail(groupId: string, email: string): Promise<Result<GroupMember | null, AppError>> {
    const { data, error } = await supabase
      .from('group_members')
      .select()
      .eq('group_id', groupId)
      .ilike('email', email)
      .maybeSingle();
    if (error) return err(toAppError(error, 'GroupMember'));
    if (!data) return ok(null);
    return rowToGroupMember(data);
  }

  async claimGroupMemberSlot(
    groupId: string,
    placeholderUserId: string,
    newUserId: string,
    newDisplayName: string,
  ): Promise<Result<GroupMember, AppError>> {
    const { error: rpcError } = await supabase.rpc('claim_group_member_slot', {
      p_group_id: groupId,
      p_placeholder_user_id: placeholderUserId,
    });
    if (rpcError) return err(toAppError(rpcError, 'GroupMember'));

    const { data, error } = await supabase
      .from('group_members')
      .update({ display_name: newDisplayName })
      .eq('group_id', groupId)
      .eq('user_id', newUserId)
      .select()
      .single();
    if (error || !data) return err(toAppError(error ?? { message: 'Member not found after claim', code: '404', details: '', hint: '' }, 'GroupMember'));
    return rowToGroupMember(data);
  }

  async updateMemberEmail(groupId: string, userId: string, email: string): Promise<Result<GroupMember, AppError>> {
    const { data, error } = await supabase
      .from('group_members')
      .update({ email })
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .select()
      .single();
    if (error) return err(toAppError(error, 'GroupMember', userId));
    return rowToGroupMember(data);
  }
}
