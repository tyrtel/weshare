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
  /** Finds a placeholder (guest) member by email within a group, for invite-link claiming. */
  findMemberByEmail(groupId: string, email: string): Promise<Result<GroupMember | null, AppError>>;
  /** Re-parents a placeholder's membership plus all of its financial history to a real user. */
  claimGroupMemberSlot(
    groupId: string,
    placeholderUserId: string,
    newUserId: string,
    newDisplayName: string,
  ): Promise<Result<GroupMember, AppError>>;
}
