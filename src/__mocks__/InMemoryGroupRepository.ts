import { ok, err } from '../core/types/Result';
import type { Result } from '../core/types/Result';
import type { AppError } from '../core/types/AppError';
import type { IGroupRepository } from '../core/interfaces/IGroupRepository';
import type { Group } from '../core/models/Group';
import type { GroupMember } from '../core/models/GroupMember';
import type { InvitePreview } from '../core/models/InvitePreview';
import type { User } from '../core/models/User';
import { generateId } from '../core/utils/generateId';
import { inviteLinkStatus } from '../core/logic/inviteLink';

// Groups and members are stored in separate maps, mirroring the two-table DB
// structure. This ensures that any saveGroup implementation that forgets to
// persist members is detected by a subsequent getGroup call in tests — the
// same failure mode that occurred in SupabaseGroupRepository.
type GroupRow = Omit<Group, 'members'>;

export class InMemoryGroupRepository implements IGroupRepository {
  private readonly groupRows  = new Map<string, GroupRow>();
  private readonly memberRows = new Map<string, GroupMember[]>();

  private compose(id: string): Group | undefined {
    const row = this.groupRows.get(id);
    if (!row) return undefined;
    return { ...row, members: this.memberRows.get(id) ?? [] };
  }

  seed(groups: Group[]): this {
    for (const { members, ...row } of groups) {
      this.groupRows.set(row.id, row);
      this.memberRows.set(row.id, [...members]);
    }
    return this;
  }

  getGroup = async (id: string): Promise<Result<Group, AppError>> => {
    const group = this.compose(id);
    if (!group) return err({ kind: 'NotFoundError', resource: 'Group', id });
    return ok(group);
  };

  getGroupsForUser = async (userId: string): Promise<Result<Group[], AppError>> => {
    const result: Group[] = [];
    for (const id of this.groupRows.keys()) {
      const group = this.compose(id)!;
      if (group.ownerId === userId || group.members.some(m => m.userId === userId)) {
        result.push(group);
      }
    }
    return ok(result);
  };

  getGroupInvitePreview = async (token: string): Promise<Result<InvitePreview, AppError>> => {
    for (const row of this.groupRows.values()) {
      if (row.inviteToken !== token) continue;
      const status = inviteLinkStatus(row.inviteCreatedAt, row.inviteTtlHours, new Date());
      return ok({ id: row.id, name: row.name, expired: status.kind === 'expired' });
    }
    return err({ kind: 'NotFoundError', resource: 'Group', id: token });
  };

  // Fills in inviteToken like the database trigger does.
  saveGroup = async (group: Group): Promise<Result<Group, AppError>> => {
    const { members, ...row } = group;
    this.groupRows.set(group.id, {
      ...row,
      inviteToken:     row.inviteToken ?? generateId().slice(0, 8),
      inviteCreatedAt: row.inviteCreatedAt ?? new Date(),
      inviteTtlHours:  row.inviteTtlHours ?? null,
    });
    const existing = this.memberRows.get(group.id) ?? [];
    for (const m of members) {
      if (!existing.some(e => e.userId === m.userId)) existing.push(m);
    }
    this.memberRows.set(group.id, existing);
    return ok(this.compose(group.id)!);
  };

  setInviteTtl = async (groupId: string, ttlHours: number | null): Promise<Result<Group, AppError>> => {
    const row = this.groupRows.get(groupId);
    if (!row) return err({ kind: 'NotFoundError', resource: 'Group', id: groupId });
    this.groupRows.set(groupId, { ...row, inviteTtlHours: ttlHours });
    return ok(this.compose(groupId)!);
  };

  resetInvite = async (groupId: string): Promise<Result<Group, AppError>> => {
    const row = this.groupRows.get(groupId);
    if (!row) return err({ kind: 'NotFoundError', resource: 'Group', id: groupId });
    this.groupRows.set(groupId, { ...row, inviteToken: generateId().slice(0, 8), inviteCreatedAt: new Date() });
    return ok(this.compose(groupId)!);
  };

  updateGroup = async (group: Group): Promise<Result<Group, AppError>> => {
    if (!this.groupRows.has(group.id)) {
      return err({ kind: 'NotFoundError', resource: 'Group', id: group.id });
    }
    const { members: _members, ...row } = group;
    this.groupRows.set(group.id, row);
    return ok(this.compose(group.id)!);
  };

  deleteGroup = async (id: string): Promise<Result<void, AppError>> => {
    if (!this.groupRows.has(id)) {
      return err({ kind: 'NotFoundError', resource: 'Group', id });
    }
    this.groupRows.delete(id);
    this.memberRows.delete(id);
    return ok(undefined);
  };

  addMember = async (member: GroupMember): Promise<Result<GroupMember, AppError>> => {
    if (!this.groupRows.has(member.groupId)) {
      return err({ kind: 'NotFoundError', resource: 'Group', id: member.groupId });
    }
    const existing = this.memberRows.get(member.groupId) ?? [];
    if (existing.some(m => m.userId === member.userId)) {
      return err({ kind: 'ConflictError', resource: 'GroupMember', id: member.userId });
    }
    this.memberRows.set(member.groupId, [...existing, member]);
    return ok(member);
  };

  joinGroupByInvite = async (token: string, user: User): Promise<Result<GroupMember, AppError>> => {
    const invite = await this.getGroupInvitePreview(token);
    if (!invite.ok) return invite;
    const groupId = invite.value.id;
    const list = this.memberRows.get(groupId) ?? [];

    const existing = list.find(m => m.userId === user.id);
    if (existing) return ok(existing);

    const email = user.email?.toLowerCase();
    const idx = email ? list.findIndex(m => m.email?.toLowerCase() === email) : -1;
    if (idx !== -1) {
      const claimed: GroupMember = { ...list[idx], userId: user.id, displayName: user.name, isGuest: false, avatarUrl: user.avatarUrl ?? list[idx].avatarUrl };
      this.memberRows.set(groupId, list.map((m, i) => (i === idx ? claimed : m)));
      return ok(claimed);
    }
    if (invite.value.expired) {
      return err({ kind: 'ValidationError', field: 'inviteToken', message: 'Invite expired' });
    }

    const added: GroupMember = { userId: user.id, groupId, displayName: user.name, isGuest: false, joinedAt: new Date(), avatarUrl: user.avatarUrl };
    this.memberRows.set(groupId, [...list, added]);
    return ok(added);
  };

  updateMemberEmail = async (groupId: string, userId: string, email: string): Promise<Result<GroupMember, AppError>> => {
    const list = this.memberRows.get(groupId) ?? [];
    const idx = list.findIndex(m => m.userId === userId);
    if (idx === -1) {
      return err({ kind: 'NotFoundError', resource: 'GroupMember', id: userId });
    }
    const updated: GroupMember = { ...list[idx], email };
    const next = [...list];
    next[idx] = updated;
    this.memberRows.set(groupId, next);
    return ok(updated);
  };
}
