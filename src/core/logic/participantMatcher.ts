import type { TripMember } from '../models/TripMember';

export interface MatchResult {
  matchMap: Map<string, string>;  // sourceUserId -> targetUserId
  unmatched: TripMember[];        // source members with no target match
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

/**
 * Matches source trip members to target trip members using three signals in priority order:
 *   1. Same userId (authenticated user present in both trips)
 *   2. Email (case-insensitive)
 *   3. Phone (digits only)
 *
 * Returns a matchMap of sourceUserId -> targetUserId for matched pairs,
 * and an unmatched array for source members with no target counterpart.
 */
export function matchParticipants(
  sourceMembers: TripMember[],
  targetMembers: TripMember[],
): MatchResult {
  const byUserId = new Map(targetMembers.map(m => [m.userId, m.userId]));
  const byEmail  = new Map(
    targetMembers
      .filter(m => m.email)
      .map(m => [m.email!.toLowerCase(), m.userId]),
  );
  const byPhone  = new Map(
    targetMembers
      .filter(m => m.phone)
      .map(m => [normalizePhone(m.phone!), m.userId]),
  );

  const matchMap:  Map<string, string> = new Map();
  const unmatched: TripMember[]        = [];

  for (const src of sourceMembers) {
    const idMatch = byUserId.get(src.userId);
    if (idMatch) { matchMap.set(src.userId, idMatch); continue; }

    const emailMatch = src.email ? byEmail.get(src.email.toLowerCase()) : undefined;
    if (emailMatch) { matchMap.set(src.userId, emailMatch); continue; }

    const phoneMatch = src.phone ? byPhone.get(normalizePhone(src.phone)) : undefined;
    if (phoneMatch) { matchMap.set(src.userId, phoneMatch); continue; }

    unmatched.push(src);
  }

  return { matchMap, unmatched };
}
