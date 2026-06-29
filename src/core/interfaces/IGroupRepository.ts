import type { Result } from '../types/Result';
import type { AppError } from '../types/AppError';
import type { Group } from '../models/Group';
import type { GroupMember } from '../models/GroupMember';

export interface IGroupRepository {
  getGroup(id: string): Promise<Result<Group, AppError>>;
  getGroupsForUser(userId: string): Promise<Result<Group[], AppError>>;
  getGroupByInviteToken(token: string): Promise<Result<Group, AppError>>;
  saveGroup(group: Group): Promise<Result<Group, AppError>>;
  updateGroup(group: Group): Promise<Result<Group, AppError>>;
  deleteGroup(id: string): Promise<Result<void, AppError>>;
  addMember(member: GroupMember): Promise<Result<GroupMember, AppError>>;
}
