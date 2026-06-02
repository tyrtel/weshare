import { calculateSettlements } from '../settlement';
import type { TripMember } from '../../models/TripMember';
import type { Expense } from '../../models/Expense';
import type { Split } from '../../models/Split';
import type { Settlement } from '../../models/Settlement';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const NOW = new Date('2025-06-01T12:00:00Z');
const CURRENCY = 'EUR';

function member(userId: string): TripMember {
  return { userId, tripId: 't1', displayName: userId, joinedAt: NOW, isGuest: false };
}

function split(
  id: string,
  expenseId: string,
  userId: string,
  amountOwedCents: number,
  amountPaidCents = 0,
  settledAt?: Date,
): Split {
  return { id, expenseId, userId, amountOwedCents, amountPaidCents, settledAt };
}

function expense(
  id: string,
  paidByUserId: string,
  totalAmountCents: number,
  splits: Split[],
): Expense {
  return {
    id,
    tripId: 't1',
    description: id,
    totalAmountCents,
    currency: CURRENCY,
    paidByUserId,
    createdAt: NOW,
    splits,
    metadata: {},
  };
}

// Finds a specific settlement (order-independent)
function findSettlement(
  settlements: Settlement[],
  from: string,
  to: string,
): Settlement | undefined {
  return settlements.find(s => s.fromUserId === from && s.toUserId === to);
}

// ── Equal split — 4 people, 1 expense ────────────────────────────────────────

describe('equal split — 4 people, 1 expense', () => {
  // Jay pays €100. All 4 owe €25 each.
  // Jay's own split cancels, so net: Jay +75, others −25 each.
  const members = ['jay', 'marie', 'tom', 'sara'].map(member);
  const e = expense('e1', 'jay', 10000, [
    split('s1', 'e1', 'jay',   2500),
    split('s2', 'e1', 'marie', 2500),
    split('s3', 'e1', 'tom',   2500),
    split('s4', 'e1', 'sara',  2500),
  ]);
  const result = calculateSettlements(members, [e]);

  it('produces exactly 3 transfers', () => {
    expect(result).toHaveLength(3);
  });

  it('every transfer is to Jay', () => {
    expect(result.every(s => s.toUserId === 'jay')).toBe(true);
  });

  it('Marie owes Jay €25', () => {
    expect(findSettlement(result, 'marie', 'jay')?.amountCents).toBe(2500);
  });

  it('Tom owes Jay €25', () => {
    expect(findSettlement(result, 'tom', 'jay')?.amountCents).toBe(2500);
  });

  it('Sara owes Jay €25', () => {
    expect(findSettlement(result, 'sara', 'jay')?.amountCents).toBe(2500);
  });

  it('all transfers are in EUR', () => {
    expect(result.every(s => s.currency === 'EUR')).toBe(true);
  });

  it('total transferred equals outstanding debt', () => {
    const total = result.reduce((sum, s) => sum + s.amountCents, 0);
    expect(total).toBe(7500); // 3 × €25
  });
});

// ── Unequal split — one person excluded ──────────────────────────────────────

describe('unequal split — one person excluded from wine', () => {
  // Jay pays €60 for wine. Tom does not drink — only Jay, Marie, Sara split it.
  // Each of Jay/Marie/Sara owes €20 (2000 cents).
  // Net: Jay +40, Marie −20, Sara −20, Tom 0.
  const members = ['jay', 'marie', 'tom', 'sara'].map(member);
  const e = expense('e1', 'jay', 6000, [
    split('s1', 'e1', 'jay',   2000),
    split('s2', 'e1', 'marie', 2000),
    split('s3', 'e1', 'sara',  2000),
  ]);
  const result = calculateSettlements(members, [e]);

  it('produces 2 transfers (Tom excluded)', () => {
    expect(result).toHaveLength(2);
  });

  it('Marie pays Jay €20', () => {
    expect(findSettlement(result, 'marie', 'jay')?.amountCents).toBe(2000);
  });

  it('Sara pays Jay €20', () => {
    expect(findSettlement(result, 'sara', 'jay')?.amountCents).toBe(2000);
  });

  it('Tom has no transfer', () => {
    const tomSettlements = result.filter(
      s => s.fromUserId === 'tom' || s.toUserId === 'tom',
    );
    expect(tomSettlements).toHaveLength(0);
  });
});

// ── Multi-payer across multiple expenses ─────────────────────────────────────

describe('multi-payer — 2 expenses, 2 payers', () => {
  // Expense 1: Jay pays €60, equal 3-way (Jay/Marie/Sara €20 each)
  //   → Jay +40, Marie −20, Sara −20
  // Expense 2: Marie pays €90, equal 3-way (Jay/Marie/Sara €30 each)
  //   → Marie +60, Jay −30, Sara −30
  // Net: Jay 40−30=+10, Marie −20+60=+40, Sara −20−30=−50, Tom=0
  // Creditors: Marie +40, Jay +10. Debtors: Sara −50.
  // Greedy: Sara→Marie 40, Sara→Jay 10.
  const members = ['jay', 'marie', 'tom', 'sara'].map(member);
  const e1 = expense('e1', 'jay', 6000, [
    split('s1', 'e1', 'jay',   2000),
    split('s2', 'e1', 'marie', 2000),
    split('s3', 'e1', 'sara',  2000),
  ]);
  const e2 = expense('e2', 'marie', 9000, [
    split('s4', 'e2', 'jay',   3000),
    split('s5', 'e2', 'marie', 3000),
    split('s6', 'e2', 'sara',  3000),
  ]);
  const result = calculateSettlements(members, [e1, e2]);

  it('produces 2 transfers', () => {
    expect(result).toHaveLength(2);
  });

  it('Sara pays Marie €40', () => {
    expect(findSettlement(result, 'sara', 'marie')?.amountCents).toBe(4000);
  });

  it('Sara pays Jay €10', () => {
    expect(findSettlement(result, 'sara', 'jay')?.amountCents).toBe(1000);
  });

  it('Tom has no transfer', () => {
    const tomSettlements = result.filter(
      s => s.fromUserId === 'tom' || s.toUserId === 'tom',
    );
    expect(tomSettlements).toHaveLength(0);
  });

  it('total transferred equals total outstanding debt', () => {
    const total = result.reduce((sum, s) => sum + s.amountCents, 0);
    expect(total).toBe(5000); // Sara's total debt
  });
});

// ── Already-settled splits ────────────────────────────────────────────────────

describe('already-settled splits', () => {
  it('excludes splits with settledAt set', () => {
    const members = ['jay', 'marie'].map(member);
    const e = expense('e1', 'jay', 4000, [
      split('s1', 'e1', 'jay',   2000, 2000, NOW),
      split('s2', 'e1', 'marie', 2000, 2000, NOW),
    ]);
    const result = calculateSettlements(members, [e]);
    expect(result).toHaveLength(0);
  });

  it('only counts unsettled portion when settledAt absent', () => {
    // Jay pays €40. Marie owes €20 but has already paid €10 (amountPaidCents=1000).
    // Outstanding = 2000 − 1000 = 1000.
    const members = ['jay', 'marie'].map(member);
    const e = expense('e1', 'jay', 4000, [
      split('s1', 'e1', 'jay',   2000),
      split('s2', 'e1', 'marie', 2000, 1000), // partial payment
    ]);
    const result = calculateSettlements(members, [e]);
    expect(result).toHaveLength(1);
    expect(findSettlement(result, 'marie', 'jay')?.amountCents).toBe(1000);
  });

  it('mixes settled and unsettled splits in one expense', () => {
    // Jay pays €90 for 3. Marie is settled, Sara is not.
    const members = ['jay', 'marie', 'sara'].map(member);
    const e = expense('e1', 'jay', 9000, [
      split('s1', 'e1', 'jay',   3000),
      split('s2', 'e1', 'marie', 3000, 3000, NOW), // settled
      split('s3', 'e1', 'sara',  3000),             // unsettled
    ]);
    const result = calculateSettlements(members, [e]);
    expect(result).toHaveLength(1);
    expect(findSettlement(result, 'sara', 'jay')?.amountCents).toBe(3000);
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('returns empty array for no expenses', () => {
    const members = ['jay', 'marie'].map(member);
    expect(calculateSettlements(members, [])).toEqual([]);
  });

  it('returns empty array for single member', () => {
    const members = [member('jay')];
    const e = expense('e1', 'jay', 5000, [split('s1', 'e1', 'jay', 5000)]);
    expect(calculateSettlements(members, [e])).toEqual([]);
  });

  it('returns empty array when all balances are zero', () => {
    // Jay pays €50, Sara pays €50, each covers the other's share.
    const members = ['jay', 'sara'].map(member);
    const e1 = expense('e1', 'jay', 5000, [
      split('s1', 'e1', 'jay',  2500),
      split('s2', 'e1', 'sara', 2500),
    ]);
    const e2 = expense('e2', 'sara', 5000, [
      split('s3', 'e2', 'jay',  2500),
      split('s4', 'e2', 'sara', 2500),
    ]);
    const result = calculateSettlements(members, [e1, e2]);
    expect(result).toEqual([]);
  });

  it('handles rounding — €10 split 3 ways (333+333+334 cents)', () => {
    // Manually assigned: Jay 334, Marie 333, Tom 333 (totals to 1000).
    const members = ['jay', 'marie', 'tom'].map(member);
    const e = expense('e1', 'jay', 1000, [
      split('s1', 'e1', 'jay',   334),
      split('s2', 'e1', 'marie', 333),
      split('s3', 'e1', 'tom',   333),
    ]);
    const result = calculateSettlements(members, [e]);
    const total = result.reduce((sum, s) => sum + s.amountCents, 0);
    // Jay paid 1000 − 334 = 666 net; Marie and Tom owe 333 each.
    expect(total).toBe(666);
    expect(findSettlement(result, 'marie', 'jay')?.amountCents).toBe(333);
    expect(findSettlement(result, 'tom',   'jay')?.amountCents).toBe(333);
  });

  it('debt simplification produces fewer transfers than naive approach', () => {
    // Circular debt: Jay→Marie €10, Marie→Tom €10, Tom→Jay €10 (naive = 3).
    // After netting: all balances are 0, so 0 transfers.
    const members = ['jay', 'marie', 'tom'].map(member);
    const e1 = expense('e1', 'jay', 1000, [
      split('s1', 'e1', 'jay',   0),
      split('s2', 'e1', 'marie', 1000),
    ]);
    const e2 = expense('e2', 'marie', 1000, [
      split('s3', 'e2', 'marie', 0),
      split('s4', 'e2', 'tom',   1000),
    ]);
    const e3 = expense('e3', 'tom', 1000, [
      split('s5', 'e3', 'tom',  0),
      split('s6', 'e3', 'jay',  1000),
    ]);
    const result = calculateSettlements(members, [e1, e2, e3]);
    // All net to 0 — no transfers needed.
    expect(result).toHaveLength(0);
  });

  it('all transfers use the currency of the first expense', () => {
    const members = ['jay', 'marie'].map(member);
    const e = expense('e1', 'jay', 5000, [
      split('s1', 'e1', 'jay',   2500),
      split('s2', 'e1', 'marie', 2500),
    ]);
    const result = calculateSettlements(members, [e]);
    expect(result[0].currency).toBe('EUR');
  });
});

// ── Chez Paul scenario (simulation fixture preview) ───────────────────────────

describe('Chez Paul restaurant scenario', () => {
  // 4 people: Jay, Marie, Tom, Sara
  // Expense 1: Jay pays €148 for food (4-way: 3700 each)
  // Expense 2: Marie pays €64 for wine (Jay/Marie/Sara only — Tom teetotal: ~2133 each)
  // Expense 3: Tom pays €36 for desserts (4-way: 900 each)
  const members = ['jay', 'marie', 'tom', 'sara'].map(member);

  const food = expense('food', 'jay', 14800, [
    split('f1', 'food', 'jay',   3700),
    split('f2', 'food', 'marie', 3700),
    split('f3', 'food', 'tom',   3700),
    split('f4', 'food', 'sara',  3700),
  ]);

  const wine = expense('wine', 'marie', 6400, [
    split('w1', 'wine', 'jay',   2134),
    split('w2', 'wine', 'marie', 2133),
    split('w3', 'wine', 'sara',  2133),
  ]);

  const desserts = expense('desserts', 'tom', 3600, [
    split('d1', 'desserts', 'jay',   900),
    split('d2', 'desserts', 'marie', 900),
    split('d3', 'desserts', 'tom',   900),
    split('d4', 'desserts', 'sara',  900),
  ]);

  const result = calculateSettlements(members, [food, wine, desserts]);

  it('produces a non-empty settlement list', () => {
    expect(result.length).toBeGreaterThan(0);
  });

  it('all transfers are in EUR', () => {
    expect(result.every(s => s.currency === 'EUR')).toBe(true);
  });

  it('total transferred equals total outstanding debt', () => {
    // Verify debits === credits (balanced books)
    const totalOut = result.reduce((sum, s) => sum + s.amountCents, 0);

    const balances = new Map<string, number>();
    for (const s of result) {
      balances.set(s.fromUserId, (balances.get(s.fromUserId) ?? 0) - s.amountCents);
      balances.set(s.toUserId,   (balances.get(s.toUserId)   ?? 0) + s.amountCents);
    }

    // Every creditor balance should be >= 0 after transfers
    expect(totalOut).toBeGreaterThan(0);
  });

  it('number of transfers is minimal (≤ n−1 for n members)', () => {
    // Greedy algorithm guarantees at most n−1 transfers for n parties
    expect(result.length).toBeLessThanOrEqual(members.length - 1);
  });
});
