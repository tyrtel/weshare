import { computeSplitTotals } from '../computations/splitTotals';
import { deriveAssignments } from '../computations/assignmentState';
import { computePeopleWithTotals } from '../computations/peopleWithTotals';
import { memberFactory, splitFactory, expenseFactory, TEST_DATE as NOW } from '../../__testUtils__/factories';

// ---------------------------------------------------------------------------
// computeSplitTotals
// ---------------------------------------------------------------------------

describe('computeSplitTotals', () => {
  describe('zero-item edge case', () => {
    it('returns all zeros when there are no expenses', () => {
      const totals = computeSplitTotals('u1', [], 'EUR');
      expect(totals.foodTotalCents).toBe(0);
      expect(totals.taxShareCents).toBe(0);
      expect(totals.serviceShareCents).toBe(0);
      expect(totals.grandTotalCents).toBe(0);
    });

    it('returns zero when the person has no splits in any expense', () => {
      const expense = expenseFactory({ id: 'e1', tripId: 't1', splits: [
        splitFactory({ id: 's1', expenseId: 'e1', userId: 'u2', amountOwedCents: 5000 }),
      ] });
      expect(computeSplitTotals('u1', [expense], 'EUR').foodTotalCents).toBe(0);
    });
  });

  describe('single assignee', () => {
    it('returns the full split amount when the person is the only assignee', () => {
      const expense = expenseFactory({ id: 'e1', tripId: 't1', splits: [
        splitFactory({ id: 's1', expenseId: 'e1', userId: 'u1', amountOwedCents: 10000 }),
      ] });
      const totals = computeSplitTotals('u1', [expense], 'EUR');
      expect(totals.foodTotalCents).toBe(10000);
      expect(totals.grandTotalCents).toBe(10000);
    });

    it('ignores splits belonging to other users', () => {
      const expense = expenseFactory({ id: 'e1', tripId: 't1', splits: [
        splitFactory({ id: 's1', expenseId: 'e1', userId: 'u1', amountOwedCents: 5000 }),
        splitFactory({ id: 's2', expenseId: 'e1', userId: 'u2', amountOwedCents: 5000 }),
        splitFactory({ id: 's3', expenseId: 'e1', userId: 'u3', amountOwedCents: 5000 }),
      ] });
      expect(computeSplitTotals('u1', [expense], 'EUR').foodTotalCents).toBe(5000);
    });
  });

  describe('multi-assignee shared item', () => {
    it('each person receives only their own share', () => {
      // €10.00 split 3 ways: 334 + 333 + 333 = 1000
      const splits = [
        splitFactory({ id: 's1', expenseId: 'e1', userId: 'u1', amountOwedCents: 334 }),
        splitFactory({ id: 's2', expenseId: 'e1', userId: 'u2', amountOwedCents: 333 }),
        splitFactory({ id: 's3', expenseId: 'e1', userId: 'u3', amountOwedCents: 333 }),
      ];
      const expense = expenseFactory({ id: 'e1', tripId: 't1', splits: splits });

      expect(computeSplitTotals('u1', [expense], 'EUR').foodTotalCents).toBe(334);
      expect(computeSplitTotals('u2', [expense], 'EUR').foodTotalCents).toBe(333);
      expect(computeSplitTotals('u3', [expense], 'EUR').foodTotalCents).toBe(333);
    });

    it('all individual shares sum to the expense total', () => {
      const splits = [
        splitFactory({ id: 's1', expenseId: 'e1', userId: 'u1', amountOwedCents: 334 }),
        splitFactory({ id: 's2', expenseId: 'e1', userId: 'u2', amountOwedCents: 333 }),
        splitFactory({ id: 's3', expenseId: 'e1', userId: 'u3', amountOwedCents: 333 }),
      ];
      const expense = expenseFactory({ id: 'e1', tripId: 't1', splits: splits });
      const total =
        computeSplitTotals('u1', [expense], 'EUR').foodTotalCents +
        computeSplitTotals('u2', [expense], 'EUR').foodTotalCents +
        computeSplitTotals('u3', [expense], 'EUR').foodTotalCents;
      expect(total).toBe(1000);
    });
  });

  describe('three-way split rounding', () => {
    it('sum of three rounded shares equals the exact original total (100¢)', () => {
      // Math.floor(100 / 3) = 33, remainder 1 → one person gets 34
      const splits = [
        splitFactory({ id: 's1', expenseId: 'e1', userId: 'u1', amountOwedCents: 34 }),
        splitFactory({ id: 's2', expenseId: 'e1', userId: 'u2', amountOwedCents: 33 }),
        splitFactory({ id: 's3', expenseId: 'e1', userId: 'u3', amountOwedCents: 33 }),
      ];
      const expense = expenseFactory({ id: 'e1', tripId: 't1', splits: splits });
      const u1 = computeSplitTotals('u1', [expense], 'EUR').foodTotalCents;
      const u2 = computeSplitTotals('u2', [expense], 'EUR').foodTotalCents;
      const u3 = computeSplitTotals('u3', [expense], 'EUR').foodTotalCents;
      expect(u1 + u2 + u3).toBe(100);
      expect(u1).toBe(34);
    });

    it('sum of seven rounded shares equals exact total (1000¢)', () => {
      // 1000 / 7 = 142.857...; floor = 142; remainder 6 → 6 people get 143, 1 gets 142
      const shares = [143, 143, 143, 143, 143, 143, 142];
      const splits = shares.map((amt, i) =>
        splitFactory({ id: `s${i}`, expenseId: 'e1', userId: `u${i}`, amountOwedCents: amt }),
      );
      const expense = expenseFactory({ id: 'e1', tripId: 't1', splits: splits });
      const sum = shares
        .map((_, i) => computeSplitTotals(`u${i}`, [expense], 'EUR').foodTotalCents)
        .reduce((a, b) => a + b, 0);
      expect(sum).toBe(1000);
    });
  });

  describe('all-settled edge case', () => {
    it('includes settled splits in foodTotal — it tracks what was owed, not outstanding', () => {
      const expense = expenseFactory({ id: 'e1', tripId: 't1', splits: [
        splitFactory({ id: 's1', expenseId: 'e1', userId: 'u1', amountOwedCents: 5000, amountPaidCents: 5000, settledAt: NOW }),
      ] });
      expect(computeSplitTotals('u1', [expense], 'EUR').foodTotalCents).toBe(5000);
    });

    it('still returns 0 when person has no splits even if others are settled', () => {
      const expense = expenseFactory({ id: 'e1', tripId: 't1', splits: [
        splitFactory({ id: 's1', expenseId: 'e1', userId: 'u2', amountOwedCents: 5000, amountPaidCents: 5000, settledAt: NOW }),
      ] });
      expect(computeSplitTotals('u1', [expense], 'EUR').foodTotalCents).toBe(0);
    });
  });

  describe('multi-expense accumulation', () => {
    it('sums totals across multiple expenses for the same person', () => {
      const e1 = expenseFactory({ id: 'e1', tripId: 't1', splits: [splitFactory({ id: 's1', expenseId: 'e1', userId: 'u1', amountOwedCents: 3000 })] });
      const e2 = expenseFactory({ id: 'e2', tripId: 't1', splits: [splitFactory({ id: 's2', expenseId: 'e2', userId: 'u1', amountOwedCents: 2000 })] });
      expect(computeSplitTotals('u1', [e1, e2], 'EUR').foodTotalCents).toBe(5000);
    });

    it('grandTotal equals foodTotal when tax and service are zero', () => {
      const expense = expenseFactory({ id: 'e1', tripId: 't1', splits: [splitFactory({ id: 's1', expenseId: 'e1', userId: 'u1', amountOwedCents: 7500 })] });
      const totals = computeSplitTotals('u1', [expense], 'EUR');
      expect(totals.grandTotalCents).toBe(totals.foodTotalCents);
    });
  });

  describe('display formatting', () => {
    it('formats grandTotalDisplay as a currency string containing the amount', () => {
      const expense = expenseFactory({ id: 'e1', tripId: 't1', splits: [splitFactory({ id: 's1', expenseId: 'e1', userId: 'u1', amountOwedCents: 14800 })] });
      const { grandTotalDisplay } = computeSplitTotals('u1', [expense], 'EUR');
      expect(grandTotalDisplay).toMatch(/148/);
    });

    it('formats zero amounts as a currency string', () => {
      const { grandTotalDisplay } = computeSplitTotals('u1', [], 'EUR');
      expect(grandTotalDisplay).toMatch(/0/);
    });

    it('preserves currency code in the output', () => {
      const expense = expenseFactory({ id: 'e1', tripId: 't1', splits: [splitFactory({ id: 's1', expenseId: 'e1', userId: 'u1', amountOwedCents: 5000 })] });
      const { currency } = computeSplitTotals('u1', [expense], 'GBP');
      expect(currency).toBe('GBP');
    });
  });
});

// ---------------------------------------------------------------------------
// deriveAssignments
// ---------------------------------------------------------------------------

describe('deriveAssignments', () => {
  it('maps each expense to the userIds in its splits', () => {
    const expense = expenseFactory({ id: 'e1', tripId: 't1', splits: [
      splitFactory({ id: 's1', expenseId: 'e1', userId: 'u1', amountOwedCents: 5000 }),
      splitFactory({ id: 's2', expenseId: 'e1', userId: 'u2', amountOwedCents: 5000 }),
    ] });
    const { assignments } = deriveAssignments([expense]);
    expect(assignments['e1']).toEqual(['u1', 'u2']);
  });

  it('returns an empty array for expenses with no splits', () => {
    const expense = expenseFactory({ id: 'e1', tripId: 't1', splits: [] });
    const { assignments } = deriveAssignments([expense]);
    expect(assignments['e1']).toEqual([]);
  });

  it('identifies unassigned expenses correctly', () => {
    const assigned = expenseFactory({ id: 'e1', tripId: 't1', splits: [splitFactory({ id: 's1', expenseId: 'e1', userId: 'u1', amountOwedCents: 5000 })] });
    const unassigned = expenseFactory({ id: 'e2', tripId: 't1', splits: [] });
    const { unassignedExpenses } = deriveAssignments([assigned, unassigned]);
    expect(unassignedExpenses).toHaveLength(1);
    expect(unassignedExpenses[0].id).toBe('e2');
  });

  it('returns empty structures when there are no expenses', () => {
    const { assignments, unassignedExpenses } = deriveAssignments([]);
    expect(assignments).toEqual({});
    expect(unassignedExpenses).toEqual([]);
  });

  it('handles multiple expenses correctly', () => {
    const e1 = expenseFactory({ id: 'e1', tripId: 't1', splits: [splitFactory({ id: 's1', expenseId: 'e1', userId: 'u1', amountOwedCents: 3000 })] });
    const e2 = expenseFactory({ id: 'e2', tripId: 't1', splits: [
      splitFactory({ id: 's2', expenseId: 'e2', userId: 'u1', amountOwedCents: 1500 }),
      splitFactory({ id: 's3', expenseId: 'e2', userId: 'u2', amountOwedCents: 1500 }),
    ] });
    const e3 = expenseFactory({ id: 'e3', tripId: 't1', splits: [] }); // unassigned
    const result = deriveAssignments([e1, e2, e3]);
    expect(result.assignments['e1']).toEqual(['u1']);
    expect(result.assignments['e2']).toEqual(['u1', 'u2']);
    expect(result.unassignedExpenses).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// computePeopleWithTotals
// ---------------------------------------------------------------------------

describe('computePeopleWithTotals', () => {
  it('decorates each member with their grandTotal', () => {
    const members = [memberFactory({ userId: 'u1', displayName: 'u1' }), memberFactory({ userId: 'u2', displayName: 'u2' })];
    const expenses = [
      expenseFactory({ id: 'e1', tripId: 't1', splits: [
        splitFactory({ id: 's1', expenseId: 'e1', userId: 'u1', amountOwedCents: 6000 }),
        splitFactory({ id: 's2', expenseId: 'e1', userId: 'u2', amountOwedCents: 4000 }),
      ] }),
    ];
    const result = computePeopleWithTotals(members, expenses, 'EUR');
    const u1 = result.find((m) => m.userId === 'u1')!;
    const u2 = result.find((m) => m.userId === 'u2')!;
    expect(u1.grandTotalCents).toBe(6000);
    expect(u2.grandTotalCents).toBe(4000);
  });

  it('preserves all TripMember fields on the decorated output', () => {
    const member = memberFactory({ userId: 'u1', displayName: 'u1' });
    const result = computePeopleWithTotals([member], [], 'EUR');
    expect(result[0].userId).toBe(member.userId);
    expect(result[0].displayName).toBe(member.displayName);
    expect(result[0].isGuest).toBe(member.isGuest);
    expect(result[0].joinedAt).toBe(member.joinedAt);
  });

  it('returns 0 grandTotal for members with no splits', () => {
    const result = computePeopleWithTotals([memberFactory({ userId: 'u1', displayName: 'u1' })], [], 'EUR');
    expect(result[0].grandTotalCents).toBe(0);
  });

  it('returns an empty array when there are no members', () => {
    const expense = expenseFactory({ id: 'e1', tripId: 't1', splits: [splitFactory({ id: 's1', expenseId: 'e1', userId: 'u1', amountOwedCents: 5000 })] });
    expect(computePeopleWithTotals([], [expense], 'EUR')).toEqual([]);
  });

  it('grandTotalDisplay is a formatted currency string', () => {
    const members = [memberFactory({ userId: 'u1', displayName: 'u1' })];
    const expenses = [expenseFactory({ id: 'e1', tripId: 't1', splits: [splitFactory({ id: 's1', expenseId: 'e1', userId: 'u1', amountOwedCents: 10000 })] })];
    const result = computePeopleWithTotals(members, expenses, 'EUR');
    expect(result[0].grandTotalDisplay).toMatch(/100/);
  });

  it('sums across multiple expenses per member', () => {
    const e1 = expenseFactory({ id: 'e1', tripId: 't1', splits: [splitFactory({ id: 's1', expenseId: 'e1', userId: 'u1', amountOwedCents: 3000 })] });
    const e2 = expenseFactory({ id: 'e2', tripId: 't1', splits: [splitFactory({ id: 's2', expenseId: 'e2', userId: 'u1', amountOwedCents: 2000 })] });
    const result = computePeopleWithTotals([memberFactory({ userId: 'u1', displayName: 'u1' })], [e1, e2], 'EUR');
    expect(result[0].grandTotalCents).toBe(5000);
  });

  it('handles settled splits without changing the total', () => {
    const expense = expenseFactory({ id: 'e1', tripId: 't1', splits: [splitFactory({ id: 's1', expenseId: 'e1', userId: 'u1', amountOwedCents: 5000, amountPaidCents: 5000, settledAt: NOW })] });
    const result = computePeopleWithTotals([memberFactory({ userId: 'u1', displayName: 'u1' })], [expense], 'EUR');
    expect(result[0].grandTotalCents).toBe(5000);
  });
});
