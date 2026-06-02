import { matchParticipants } from '../participantMatcher';
import type { TripMember } from '../../models/TripMember';
import { memberFactory } from '../../../__testUtils__/factories';

const NOW = new Date('2025-01-01');

// ── userId matching ───────────────────────────────────────────────────────────

describe('matchParticipants — userId (same person in both trips)', () => {
  it('matches when source and target share a userId', () => {
    const src = [memberFactory({ userId: 'u1', tripId: 'src' })];
    const tgt = [memberFactory({ userId: 'u1', tripId: 'tgt' })];
    const { matchMap, unmatched } = matchParticipants(src, tgt);
    expect(matchMap.get('u1')).toBe('u1');
    expect(unmatched).toHaveLength(0);
  });

  it('prioritises userId over email when both match different targets', () => {
    const src = [memberFactory({ userId: 'u1', tripId: 'src', email: 'a@x.com' })];
    // Target has same userId AND another member with same email
    const tgt = [
      memberFactory({ userId: 'u1', tripId: 'tgt' }),
      memberFactory({ userId: 'u99', tripId: 'tgt', email: 'a@x.com' }),
    ];
    const { matchMap } = matchParticipants(src, tgt);
    expect(matchMap.get('u1')).toBe('u1');  // userId wins
  });
});

// ── email matching ────────────────────────────────────────────────────────────

describe('matchParticipants — email', () => {
  it('matches by email when userIds differ', () => {
    const src = [memberFactory({ userId: 's1', email: 'marie@example.com' })];
    const tgt = [memberFactory({ userId: 't1', email: 'marie@example.com' })];
    const { matchMap, unmatched } = matchParticipants(src, tgt);
    expect(matchMap.get('s1')).toBe('t1');
    expect(unmatched).toHaveLength(0);
  });

  it('email matching is case-insensitive', () => {
    const src = [memberFactory({ userId: 's1', email: 'Marie@Example.COM' })];
    const tgt = [memberFactory({ userId: 't1', email: 'marie@example.com' })];
    const { matchMap } = matchParticipants(src, tgt);
    expect(matchMap.get('s1')).toBe('t1');
  });

  it('does not match on empty email strings', () => {
    const src = [memberFactory({ userId: 's1', email: '' })];
    const tgt = [memberFactory({ userId: 't1', email: '' })];
    const { unmatched } = matchParticipants(src, tgt);
    expect(unmatched).toHaveLength(1);
  });
});

// ── phone matching ────────────────────────────────────────────────────────────

describe('matchParticipants — phone', () => {
  it('matches by phone when email is absent', () => {
    const src = [memberFactory({ userId: 's1', phone: '+33612345678' })];
    const tgt = [memberFactory({ userId: 't1', phone: '+33612345678' })];
    const { matchMap, unmatched } = matchParticipants(src, tgt);
    expect(matchMap.get('s1')).toBe('t1');
    expect(unmatched).toHaveLength(0);
  });

  it('normalises phone to digits before comparing', () => {
    const src = [memberFactory({ userId: 's1', phone: '+33 6 12 34 56 78' })];
    const tgt = [memberFactory({ userId: 't1', phone: '33612345678' })];
    const { matchMap } = matchParticipants(src, tgt);
    expect(matchMap.get('s1')).toBe('t1');
  });

  it('email takes priority over phone', () => {
    const src = [memberFactory({ userId: 's1', email: 'jay@x.com', phone: '0600000000' })];
    const tgt = [
      memberFactory({ userId: 't1', email: 'jay@x.com' }),
      memberFactory({ userId: 't2', phone: '0600000000' }),
    ];
    const { matchMap } = matchParticipants(src, tgt);
    expect(matchMap.get('s1')).toBe('t1');  // email wins
  });
});

// ── partial overlap ───────────────────────────────────────────────────────────

describe('matchParticipants — partial overlap', () => {
  it('matches only the overlapping members and lists the rest as unmatched', () => {
    const src = [
      memberFactory({ userId: 's1', email: 'a@x.com' }),
      memberFactory({ userId: 's2', email: 'b@x.com' }),
    ];
    const tgt = [memberFactory({ userId: 't1', email: 'a@x.com' })];
    const { matchMap, unmatched } = matchParticipants(src, tgt);
    expect(matchMap.get('s1')).toBe('t1');
    expect(matchMap.has('s2')).toBe(false);
    expect(unmatched.map(m => m.userId)).toEqual(['s2']);
  });

  it('returns all source members as unmatched when there are no target members', () => {
    const src = [memberFactory({ userId: 's1' }), memberFactory({ userId: 's2' })];
    const { matchMap, unmatched } = matchParticipants(src, []);
    expect(matchMap.size).toBe(0);
    expect(unmatched).toHaveLength(2);
  });

  it('returns empty matchMap and empty unmatched when source is empty', () => {
    const tgt = [memberFactory({ userId: 't1', email: 'x@x.com' })];
    const { matchMap, unmatched } = matchParticipants([], tgt);
    expect(matchMap.size).toBe(0);
    expect(unmatched).toHaveLength(0);
  });
});

// ── no overlap ────────────────────────────────────────────────────────────────

describe('matchParticipants — no overlap', () => {
  it('returns all source members as unmatched when nothing aligns', () => {
    const src = [
      memberFactory({ userId: 's1', email: 'a@x.com', phone: '111' }),
      memberFactory({ userId: 's2', email: 'b@x.com', phone: '222' }),
    ];
    const tgt = [
      memberFactory({ userId: 't1', email: 'c@x.com', phone: '333' }),
    ];
    const { matchMap, unmatched } = matchParticipants(src, tgt);
    expect(matchMap.size).toBe(0);
    expect(unmatched).toHaveLength(2);
  });
});

// ── exact / full match ────────────────────────────────────────────────────────

describe('matchParticipants — exact full match', () => {
  it('matches all four members in a 4-way trip', () => {
    const emails = ['a@x.com', 'b@x.com', 'c@x.com', 'd@x.com'];
    const src = emails.map((e, i) => memberFactory({ userId: `s${i}`, email: e }));
    const tgt = emails.map((e, i) => memberFactory({ userId: `t${i}`, email: e }));
    const { matchMap, unmatched } = matchParticipants(src, tgt);
    expect(matchMap.size).toBe(4);
    expect(unmatched).toHaveLength(0);
  });
});
