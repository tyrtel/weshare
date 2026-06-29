import type { GroupMember } from './GroupMember';

export interface Group {
  id: string;
  name: string;
  currency: string; // ISO 4217 — e.g. 'EUR', 'USD', 'GBP'
  ownerId: string;
  createdAt: Date;
  members: GroupMember[];
  inviteToken?: string;
}
