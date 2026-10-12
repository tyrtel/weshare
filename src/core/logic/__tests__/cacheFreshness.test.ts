import { freshness, parseBucket, bucket, FRESH_MS, FORCE_SYNC_MS } from '../cacheFreshness';

describe('freshness', () => {
  const now = 1_000_000_000;

  it('is missing when never fetched', () => {
    expect(freshness(undefined, now)).toBe('missing');
  });

  it('is fresh just under FRESH_MS', () => {
    expect(freshness(now - FRESH_MS + 1, now)).toBe('fresh');
  });

  it('is stale from FRESH_MS until FORCE_SYNC_MS', () => {
    expect(freshness(now - FRESH_MS, now)).toBe('stale');
    expect(freshness(now - FORCE_SYNC_MS + 1, now)).toBe('stale');
  });

  it('is expired at FORCE_SYNC_MS and beyond', () => {
    expect(freshness(now - FORCE_SYNC_MS, now)).toBe('expired');
  });
});

describe('parseBucket', () => {
  it('splits keyed buckets on the first colon only', () => {
    expect(parseBucket(bucket.trip('a:b'))).toEqual({ kind: 'trip', id: 'a:b' });
  });

  it('returns an empty id for list buckets', () => {
    expect(parseBucket('groups')).toEqual({ kind: 'groups', id: '' });
  });
});
