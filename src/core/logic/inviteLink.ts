// Lifetimes an owner can pick for an invite link; null means it never expires.
export const INVITE_TTL_OPTIONS: readonly (number | null)[] = [24, 168, 720, null];

export const DEFAULT_TRIP_INVITE_TTL_HOURS = 168;

export function inviteExpiresAt(createdAt: Date | undefined, ttlHours: number | null | undefined): Date | null {
  if (!createdAt || ttlHours == null) return null;
  return new Date(createdAt.getTime() + ttlHours * 3_600_000);
}

export type InviteLinkStatus =
  | { kind: 'never' }
  | { kind: 'expires'; at: Date }
  | { kind: 'expired' }
  | { kind: 'closed' };

// Mirrors invite_is_open() plus the closed-trip rule in migration 052.
export function inviteLinkStatus(
  createdAt: Date | undefined,
  ttlHours: number | null | undefined,
  now: Date,
  closed = false,
): InviteLinkStatus {
  if (closed) return { kind: 'closed' };
  const at = inviteExpiresAt(createdAt, ttlHours);
  if (!at) return { kind: 'never' };
  return at > now ? { kind: 'expires', at } : { kind: 'expired' };
}

// Remaining time as the largest whole unit, for "Expires in …" labels.
export function timeRemaining(at: Date, now: Date): { unit: 'days' | 'hours' | 'minutes'; count: number } {
  const minutes = Math.max(1, Math.floor((at.getTime() - now.getTime()) / 60_000));
  if (minutes >= 48 * 60) return { unit: 'days', count: Math.floor(minutes / (24 * 60)) };
  if (minutes >= 60) return { unit: 'hours', count: Math.floor(minutes / 60) };
  return { unit: 'minutes', count: minutes };
}
