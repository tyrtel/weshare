import type { TripMember } from './TripMember';

export type TripStatus = 'active' | 'settling' | 'closed';

export interface Trip {
  id: string;
  name: string;
  currency: string; // ISO 4217 — e.g. 'EUR', 'USD', 'GBP'
  createdAt: Date;
  ownerId: string;
  members: TripMember[];
  inviteToken?: string; // short token for invite deep-links
  status: TripStatus;
  closedAt: Date | null;
}
