export const FRESH_MS      = 30_000;
export const FORCE_SYNC_MS = 12 * 60 * 60 * 1000;

export type Freshness = 'missing' | 'fresh' | 'stale' | 'expired';

export type CacheBucket =
  | 'trips'
  | 'groups'
  | `trip:${string}`
  | `group:${string}`
  | `tripRequests:${string}`
  | `groupRequests:${string}`
  | `recurring:${string}`;

export const bucket = {
  trip:          (tripId: string)  => `trip:${tripId}` as const,
  group:         (groupId: string) => `group:${groupId}` as const,
  tripRequests:  (tripId: string)  => `tripRequests:${tripId}` as const,
  groupRequests: (groupId: string) => `groupRequests:${groupId}` as const,
  recurring:     (groupId: string) => `recurring:${groupId}` as const,
};

export function freshness(fetchedAt: number | undefined, now: number): Freshness {
  if (fetchedAt === undefined) return 'missing';
  const age = now - fetchedAt;
  if (age < FRESH_MS) return 'fresh';
  if (age < FORCE_SYNC_MS) return 'stale';
  return 'expired';
}

export function parseBucket(b: CacheBucket): { kind: string; id: string } {
  const i = b.indexOf(':');
  return i === -1 ? { kind: b, id: '' } : { kind: b.slice(0, i), id: b.slice(i + 1) };
}
