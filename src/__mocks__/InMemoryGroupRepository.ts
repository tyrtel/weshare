import { ok, err } from '../core/types/Result';
import type { Result } from '../core/types/Result';
import type { AppError } from '../core/types/AppError';
import type { IGroupRepository } from '../core/interfaces/IGroupRepository';
import type { Group } from '../core/models/Group';
import type { GroupMember } from '../core/models/GroupMember';

export class InMemoryGroupRepository implements IGroupRepository {
  private readonly groups = new Map<string, Group>();

  seed(groups: Group[]): this {
    groups.forEach(g => this.groups.set(g.id, g));
    return this;
  }

  getGroup = async (id: string): Promise<Result<Group, AppError>> => {
    const group = this.groups.get(id);
    if (!group) return err({ kind: 'NotFoundError', resource: 'Group', id });
    return ok(group);
  };

  getGroupsForUser = async (userId: string): Promise<Result<Group[], AppError>> => {
    const result: Group[] = [];
    for (const group of this.groups.values()) {
      if (group.ownerId === userId || group.members.some(m => m.userId === userId)) {
        result.push(group);
      }
    }
    return ok(result);
  };

  getGroupByInviteToken = async (token: string): Promise<Result<Group, AppError>> => {
    for (const group of this.groups.values()) {
      if (group.inviteToken === token) return ok(group);
    }
    return err({ kind: 'NotFoundError', resource: 'Group', id: token });
  };

  saveGroup = async (group: Group): Promise<Result<Group, AppError>> => {
    this.groups.set(group.id, group);
    return ok(group);
  };

  updateGroup = async (group: Group): Promise<Result<Group, AppError>> => {
    if (!this.groups.has(group.id)) {
      return err({ kind: 'NotFoundError', resource: 'Group', id: group.id });
    }
    this.groups.set(group.id, group);
    return ok(group);
  };

  deleteGroup = async (id: string): Promise<Result<void, AppError>> => {
    if (!this.groups.has(id)) {
      return err({ kind: 'NotFoundError', resource: 'Group', id });
    }
    this.groups.delete(id);
    return ok(undefined);
  };

  addMember = async (member: GroupMember): Promise<Result<GroupMember, AppError>> => {
    const group = this.groups.get(member.groupId);
    if (!group) return err({ kind: 'NotFoundError', resource: 'Group', id: member.groupId });
    if (group.members.some(m => m.userId === member.userId)) {
      return err({ kind: 'ConflictError', resource: 'GroupMember', id: member.userId });
    }
    this.groups.set(group.id, { ...group, members: [...group.members, member] });
    return ok(member);
  };
}
