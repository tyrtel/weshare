export interface GroupMember {
  userId: string;
  groupId: string;
  displayName: string;
  joinedAt: Date;
  isGuest: boolean;
  phone?: string;
  email?: string;
  avatarUrl?: string;
}
