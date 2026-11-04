import type { Result } from '../types/Result';
import type { AppError } from '../types/AppError';
import type { Group } from '../models/Group';
import type { GroupMember } from '../models/GroupMember';
import type { InvitePreview } from '../models/InvitePreview';
import type { User } from '../models/User';

export interface IGroupRepository {
  getGroup(id: string): Promise<Result<Group, AppError>>;
  getGroupsForUser(userId: string): Promise<Result<Group[], AppError>>;
  getGroupInvitePreview(token: string): Promise<Result<InvitePreview, AppError>>;
  setInviteTtl(groupId: string, ttlHours: number | null): Promise<Result<Group, AppError>>;
  /** Owner only: issues a new token and restarts the expiry clock. */
  resetInvite(groupId: string): Promise<Result<Group, AppError>>;
  saveGroup(group: Group): Promise<Result<Group, AppError>>;
  updateGroup(group: Group): Promise<Result<Group, AppError>>;
  deleteGroup(id: string): Promise<Result<void, AppError>>;
  addMember(member: GroupMember): Promise<Result<GroupMember, AppError>>;
  /**
   * Joins the signed-in `user` to the group behind an invite token. Idempotent.
   * A placeholder member with the user's email is claimed (with its financial
   * history) instead of adding a new row.
   */
  joinGroupByInvite(token: string, user: User): Promise<Result<GroupMember, AppError>>;
  /** Sets (or replaces) a member's email — e.g. when an owner sends a no-email guest an invite. */
  updateMemberEmail(groupId: string, userId: string, email: string): Promise<Result<GroupMember, AppError>>;
}
