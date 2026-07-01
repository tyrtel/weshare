import { ok, err } from '../core/types/Result';
import type { Result } from '../core/types/Result';
import type { AppError } from '../core/types/AppError';
import type { IGroupRepository } from '../core/interfaces/IGroupRepository';
import type { Group } from '../core/models/Group';
import type { GroupMember } from '../core/models/GroupMember';

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

  getGroupByInviteToken = async (token: string): Promise<Result<Group, AppError>> => {
    for (const id of this.groupRows.keys()) {
      const group = this.compose(id)!;
      if (group.inviteToken === token) return ok(group);
    }
    return err({ kind: 'NotFoundError', resource: 'Group', id: token });
  };

  saveGroup = async (group: Group): Promise<Result<Group, AppError>> => {
    const { members, ...row } = group;
    this.groupRows.set(group.id, row);
    const existing = this.memberRows.get(group.id) ?? [];
    for (const m of members) {
      if (!existing.some(e => e.userId === m.userId)) existing.push(m);
    }
    this.memberRows.set(group.id, existing);
    return ok(this.compose(group.id)!);
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
}
