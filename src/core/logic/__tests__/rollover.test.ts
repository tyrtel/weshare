import { computeRolloverDebts } from '../rollover';
import type { SplitRequestStatus } from '../../models/SplitRequest';

function makeSettlement(
  fromUserId: string,
  toUserId: string,
  opts: {
    amountCents?: number;
    currency?: string;
    status?: SplitRequestStatus | null;
  } = {},
) {
  return {
    fromUserId,
    toUserId,
    amountCents: opts.amountCents ?? 1000,
    currency:    opts.currency    ?? 'EUR',
    latestRequest: opts.status != null ? { status: opts.status } : null,
  };
}

const FULL_MAP = new Map([['s1', 't1'], ['s2', 't2']]);

// ── rollable statuses ─────────────────────────────────────────────────────────

describe('computeRolloverDebts — rollable statuses', () => {
  it('rolls over a settlement with no request (null status)', () => {
    const s = [makeSettlement('s1', 's2', { status: null })];
    const map = new Map([['s1', 't1'], ['s2', 't2']]);
    const seeds = computeRolloverDebts(s, map, 'src');
    expect(seeds).toHaveLength(1);
    expect(seeds[0].fromUserId).toBe('t1');
    expect(seeds[0].toUserId).toBe('t2');
  });

  it('rolls over a settlement with status "owed"', () => {
    const s = [makeSettlement('s1', 's2', { status: 'owed' })];
    const map = new Map([['s1', 't1'], ['s2', 't2']]);
    const seeds = computeRolloverDebts(s, map, 'src');
    expect(seeds).toHaveLength(1);
  });

  it('rolls over a settlement with status "created"', () => {
    const s = [makeSettlement('s1', 's2', { status: 'created' })];
    const map = new Map([['s1', 't1'], ['s2', 't2']]);
    const seeds = computeRolloverDebts(s, map, 'src');
    expect(seeds).toHaveLength(1);
  });
});

// ── non-rollable statuses ─────────────────────────────────────────────────────

describe('computeRolloverDebts — non-rollable statuses', () => {
  const nonRollable: SplitRequestStatus[] = [
    'paid', 'request_sent', 'pending', 'authorized', 'completed', 'declined', 'expired',
  ];

  for (const status of nonRollable) {
    it(`skips settlement with status "${status}"`, () => {
      const s = [makeSettlement('s1', 's2', { status })];
      const seeds = computeRolloverDebts(s, FULL_MAP, 'src');
      expect(seeds).toHaveLength(0);
    });
  }
});

// ── matchMap remapping ────────────────────────────────────────────────────────

describe('computeRolloverDebts — userId remapping', () => {
  it('remaps both fromUserId and toUserId through matchMap', () => {
    const s = [makeSettlement('s1', 's2', { amountCents: 2500, currency: 'GBP' })];
    const map = new Map([['s1', 'tA'], ['s2', 'tB']]);
    const [seed] = computeRolloverDebts(s, map, 'src');
    expect(seed.fromUserId).toBe('tA');
    expect(seed.toUserId).toBe('tB');
    expect(seed.amountCents).toBe(2500);
    expect(seed.currency).toBe('GBP');
  });

  it('skips a settlement when fromUserId is not in matchMap', () => {
    const s = [makeSettlement('s1', 's2')];
    const map = new Map([['s2', 't2']]);    // s1 missing
    const seeds = computeRolloverDebts(s, map, 'src');
    expect(seeds).toHaveLength(0);
  });

  it('skips a settlement when toUserId is not in matchMap', () => {
    const s = [makeSettlement('s1', 's2')];
    const map = new Map([['s1', 't1']]);    // s2 missing
    const seeds = computeRolloverDebts(s, map, 'src');
    expect(seeds).toHaveLength(0);
  });

  it('skips a settlement when neither userId is in matchMap', () => {
    const s = [makeSettlement('s1', 's2')];
    const seeds = computeRolloverDebts(s, new Map(), 'src');
    expect(seeds).toHaveLength(0);
  });
});

// ── rolledOverFromTripId ──────────────────────────────────────────────────────

describe('computeRolloverDebts — rolledOverFromTripId', () => {
  it('sets rolledOverFromTripId to sourceTripId on every seed', () => {
    const s = [
      makeSettlement('s1', 's2'),
      makeSettlement('s2', 's1', { amountCents: 500 }),
    ];
    const map = new Map([['s1', 't1'], ['s2', 't2']]);
    const seeds = computeRolloverDebts(s, map, 'trip-abc');
    expect(seeds).toHaveLength(2);
    expect(seeds.every(seed => seed.rolledOverFromTripId === 'trip-abc')).toBe(true);
  });
});

// ── mixed batch ───────────────────────────────────────────────────────────────

describe('computeRolloverDebts — mixed batch', () => {
  it('only includes rollable, matched settlements from a heterogeneous list', () => {
    const s = [
      makeSettlement('s1', 's2', { status: null }),       // rollable, both matched  → include
      makeSettlement('s1', 's3', { status: 'owed' }),     // rollable, s3 unmatched  → skip
      makeSettlement('s2', 's1', { status: 'paid' }),     // non-rollable            → skip
      makeSettlement('s2', 's1', { status: 'created' }),  // rollable, both matched  → include
    ];
    const map = new Map([['s1', 't1'], ['s2', 't2']]);    // s3 intentionally absent
    const seeds = computeRolloverDebts(s, map, 'src');
    expect(seeds).toHaveLength(2);
    expect(seeds[0]).toMatchObject({ fromUserId: 't1', toUserId: 't2' });
    expect(seeds[1]).toMatchObject({ fromUserId: 't2', toUserId: 't1' });
  });
});

// ── empty inputs ──────────────────────────────────────────────────────────────

describe('computeRolloverDebts — empty inputs', () => {
  it('returns [] when settlements list is empty', () => {
    expect(computeRolloverDebts([], FULL_MAP, 'src')).toEqual([]);
  });

  it('returns [] when matchMap is empty', () => {
    const s = [makeSettlement('s1', 's2')];
    expect(computeRolloverDebts(s, new Map(), 'src')).toEqual([]);
  });
});
