import {
  computeSplitInputs,
  computeProportionalSplits,
  normaliseWeights,
  initialWeights,
} from '../utils/splitCalculations';

// ── computeSplitInputs ────────────────────────────────────────────────────────

describe('computeSplitInputs()', () => {
  it('returns empty array for empty input', () => {
    expect(computeSplitInputs([], 10000)).toEqual([]);
  });

  it('splits equally when all customAmounts are null', () => {
    const entries = [
      { userId: 'a', customAmountCents: null },
      { userId: 'b', customAmountCents: null },
      { userId: 'c', customAmountCents: null },
      { userId: 'd', customAmountCents: null },
    ];
    const result = computeSplitInputs(entries, 10000);
    expect(result).toHaveLength(4);
    result.forEach(r => expect(r.amountOwedCents).toBe(2500));
  });

  it('uses custom amounts when provided', () => {
    const entries = [
      { userId: 'a', customAmountCents: 6000 },
      { userId: 'b', customAmountCents: 4000 },
    ];
    const result = computeSplitInputs(entries, 10000);
    expect(result.find(r => r.userId === 'a')?.amountOwedCents).toBe(6000);
    expect(result.find(r => r.userId === 'b')?.amountOwedCents).toBe(4000);
  });

  it('mixes custom and auto splits — auto members share the remainder', () => {
    // a has custom 7000, b and c split the remaining 3000 equally
    const entries = [
      { userId: 'a', customAmountCents: 7000 },
      { userId: 'b', customAmountCents: null },
      { userId: 'c', customAmountCents: null },
    ];
    const result = computeSplitInputs(entries, 10000);
    expect(result.find(r => r.userId === 'a')?.amountOwedCents).toBe(7000);
    expect(result.find(r => r.userId === 'b')?.amountOwedCents).toBe(1500);
    expect(result.find(r => r.userId === 'c')?.amountOwedCents).toBe(1500);
  });

  it('sum of results always equals totalCents', () => {
    const entries = [
      { userId: 'a', customAmountCents: null },
      { userId: 'b', customAmountCents: null },
      { userId: 'c', customAmountCents: null },
    ];
    const result = computeSplitInputs(entries, 10001);
    const sum = result.reduce((s, r) => s + r.amountOwedCents, 0);
    expect(sum).toBe(10001);
  });
});

// ── computeProportionalSplits ─────────────────────────────────────────────────

describe('computeProportionalSplits()', () => {
  it('returns empty array for empty user list', () => {
    expect(computeProportionalSplits([], {}, 10000)).toEqual([]);
  });

  it('falls back to equal split when all weights are 0', () => {
    const result = computeProportionalSplits(['a', 'b'], { a: 0, b: 0 }, 10000);
    expect(result).toHaveLength(2);
    result.forEach(r => expect(r.amountOwedCents).toBe(5000));
  });

  it('splits proportionally according to weights', () => {
    // a=7500 bps, b=2500 bps → a gets 75%, b gets 25% of 10000
    const result = computeProportionalSplits(['a', 'b'], { a: 7500, b: 2500 }, 10000);
    expect(result.find(r => r.userId === 'a')?.amountOwedCents).toBe(7500);
    expect(result.find(r => r.userId === 'b')?.amountOwedCents).toBe(2500);
  });

  it('sum always equals totalCents (rounding absorbed into first member)', () => {
    // 3-way with odd amount
    const weights = { a: 3334, b: 3333, c: 3333 };
    const result  = computeProportionalSplits(['a', 'b', 'c'], weights, 10001);
    const sum     = result.reduce((s, r) => s + r.amountOwedCents, 0);
    expect(sum).toBe(10001);
  });

  it('single user gets the entire amount', () => {
    const result = computeProportionalSplits(['jay'], { jay: 10000 }, 5000);
    expect(result).toHaveLength(1);
    expect(result[0].amountOwedCents).toBe(5000);
  });
});

// ── normaliseWeights ──────────────────────────────────────────────────────────

describe('normaliseWeights()', () => {
  it('sets the changed id directly when there are no others', () => {
    const result = normaliseWeights({ a: 10000 }, 'a', 8000, ['a']);
    expect(result.a).toBe(8000);
  });

  it('gives the entire remaining weight to the other user (2 users)', () => {
    const result = normaliseWeights({ a: 5000, b: 5000 }, 'a', 3000, ['a', 'b']);
    expect(result.a).toBe(3000);
    expect(result.b).toBe(7000);
  });

  it('redistributes proportionally among others (3 users)', () => {
    // Before: a=5000, b=3000, c=2000. Change a to 6000. Remaining = 4000.
    // b's share of remaining: 3000/5000 * 4000 = 2400; c gets 4000−2400=1600
    const result = normaliseWeights({ a: 5000, b: 3000, c: 2000 }, 'a', 6000, ['a', 'b', 'c']);
    expect(result.a).toBe(6000);
    expect(result.b + result.c).toBe(4000);
  });

  it('total always sums to 10000', () => {
    for (const newWeight of [0, 2500, 5000, 7500, 9999]) {
      const weights = { a: 3334, b: 3333, c: 3333 };
      const result  = normaliseWeights(weights, 'a', newWeight, ['a', 'b', 'c']);
      const sum     = Object.values(result).reduce((s, v) => s + v, 0);
      expect(sum).toBe(10000);
    }
  });

  it('distributes evenly when other weights are all zero', () => {
    const result = normaliseWeights({ a: 5000, b: 0, c: 0 }, 'a', 4000, ['a', 'b', 'c']);
    expect(result.a).toBe(4000);
    expect(result.b + result.c).toBe(6000);
  });
});

// ── initialWeights ────────────────────────────────────────────────────────────

describe('initialWeights()', () => {
  it('returns empty object for empty list', () => {
    expect(initialWeights([])).toEqual({});
  });

  it('gives single user 10000 bps', () => {
    expect(initialWeights(['a'])).toEqual({ a: 10000 });
  });

  it('splits equally between 2 users', () => {
    const result = initialWeights(['a', 'b']);
    expect(result.a).toBe(5000);
    expect(result.b).toBe(5000);
  });

  it('distributes evenly across 3 users with remainder on last', () => {
    const result = initialWeights(['a', 'b', 'c']);
    expect(result.a).toBe(3333);
    expect(result.b).toBe(3333);
    expect(result.c).toBe(3334);
  });

  it('total always equals 10000', () => {
    for (const n of [1, 2, 3, 4, 5, 7, 13]) {
      const ids  = Array.from({ length: n }, (_, i) => `u${i}`);
      const result = initialWeights(ids);
      const sum  = Object.values(result).reduce((s, v) => s + v, 0);
      expect(sum).toBe(10000);
    }
  });
});
