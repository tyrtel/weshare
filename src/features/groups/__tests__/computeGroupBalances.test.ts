import { computeGroupBalances } from '../utils/computeGroupBalances';
import { tripFactory, expenseFactory } from '../../../__testUtils__/factories';

const MEMBERS = ['u1', 'u2', 'u3'];
const CURRENCY = 'EUR';

function makeSplit(userId: string, amountOwedCents: number) {
  return { id: `s-${userId}`, expenseId: '', userId, amountOwedCents, amountPaidCents: 0, settledAt: undefined };
}

describe('computeGroupBalances', () => {
  it('returns empty results when there are no expenses', () => {
    const { settlements, memberBalances } = computeGroupBalances(MEMBERS, [], {}, []);
    expect(settlements).toHaveLength(0);
    expect(memberBalances.every(b => b.balanceCents === 0)).toBe(true);
  });

  it('computes simple two-person balance from a group expense', () => {
    const expense = expenseFactory({
      id: 'e1', groupId: 'g1', tripId: undefined, currency: CURRENCY,
      totalAmountCents: 2000, paidByUserId: 'u1', settledAt: null,
      splits: [
        makeSplit('u1', 1000),
        makeSplit('u2', 1000),
      ],
    });

    const { settlements, memberBalances } = computeGroupBalances(['u1', 'u2'], [], {}, [expense]);

    expect(settlements).toHaveLength(1);
    expect(settlements[0].fromUserId).toBe('u2');
    expect(settlements[0].toUserId).toBe('u1');
    expect(settlements[0].amountCents).toBe(1000);

    const u1 = memberBalances.find(b => b.userId === 'u1')!;
    const u2 = memberBalances.find(b => b.userId === 'u2')!;
    expect(u1.balanceCents).toBe(1000);
    expect(u2.balanceCents).toBe(-1000);
  });

  it('aggregates trip expenses and group-level expenses together', () => {
    const trip = tripFactory({ id: 't1', groupId: 'g1', status: 'active' });
    const tripExpense = expenseFactory({
      id: 'e1', tripId: 't1', groupId: undefined, currency: CURRENCY,
      totalAmountCents: 3000, paidByUserId: 'u1', settledAt: null,
      splits: [
        makeSplit('u1', 1500),
        makeSplit('u2', 1500),
      ],
    });
    const groupExpense = expenseFactory({
      id: 'e2', groupId: 'g1', tripId: undefined, currency: CURRENCY,
      totalAmountCents: 2000, paidByUserId: 'u2', settledAt: null,
      splits: [
        makeSplit('u1', 1000),
        makeSplit('u2', 1000),
      ],
    });

    const { settlements } = computeGroupBalances(
      ['u1', 'u2'],
      [trip],
      { t1: [tripExpense] },
      [groupExpense],
    );

    expect(settlements).toHaveLength(1);
    // u1 paid trip (u2 owes u1 1500), u2 paid group expense (u1 owes u2 1000) → net u2 owes u1 500
    expect(settlements[0].fromUserId).toBe('u2');
    expect(settlements[0].toUserId).toBe('u1');
    expect(settlements[0].amountCents).toBe(500);
  });

  it('excludes settled group expenses from balance calculation', () => {
    const settled = expenseFactory({
      id: 'e1', groupId: 'g1', tripId: undefined, currency: CURRENCY,
      totalAmountCents: 2000, paidByUserId: 'u1', settledAt: new Date(),
      splits: [makeSplit('u1', 1000), makeSplit('u2', 1000)],
    });
    const active = expenseFactory({
      id: 'e2', groupId: 'g1', tripId: undefined, currency: CURRENCY,
      totalAmountCents: 1000, paidByUserId: 'u1', settledAt: null,
      splits: [makeSplit('u1', 500), makeSplit('u2', 500)],
    });

    const { settlements } = computeGroupBalances(['u1', 'u2'], [], {}, [settled, active]);

    expect(settlements).toHaveLength(1);
    expect(settlements[0].amountCents).toBe(500);
  });

  it('returns even balances when all debts cancel out', () => {
    const e1 = expenseFactory({
      id: 'e1', groupId: 'g1', tripId: undefined, currency: CURRENCY,
      totalAmountCents: 2000, paidByUserId: 'u1', settledAt: null,
      splits: [makeSplit('u1', 1000), makeSplit('u2', 1000)],
    });
    const e2 = expenseFactory({
      id: 'e2', groupId: 'g1', tripId: undefined, currency: CURRENCY,
      totalAmountCents: 2000, paidByUserId: 'u2', settledAt: null,
      splits: [makeSplit('u1', 1000), makeSplit('u2', 1000)],
    });

    const { settlements, memberBalances } = computeGroupBalances(['u1', 'u2'], [], {}, [e1, e2]);

    expect(settlements).toHaveLength(0);
    expect(memberBalances.every(b => b.balanceCents === 0)).toBe(true);
  });

  it('produces minimal transfers for three-person group', () => {
    // u1 paid everything: u2 owes 1000, u3 owes 1000
    const expense = expenseFactory({
      id: 'e1', groupId: 'g1', tripId: undefined, currency: CURRENCY,
      totalAmountCents: 3000, paidByUserId: 'u1', settledAt: null,
      splits: [
        makeSplit('u1', 1000),
        makeSplit('u2', 1000),
        makeSplit('u3', 1000),
      ],
    });

    const { settlements } = computeGroupBalances(MEMBERS, [], {}, [expense]);

    expect(settlements).toHaveLength(2);
    expect(settlements.every(s => s.toUserId === 'u1')).toBe(true);
    const total = settlements.reduce((s, t) => s + t.amountCents, 0);
    expect(total).toBe(2000);
  });

  it('ignores trips not in the provided tripExpenses map', () => {
    const trip = tripFactory({ id: 't1', groupId: 'g1', status: 'active' });
    const { settlements } = computeGroupBalances(['u1', 'u2'], [trip], {}, []);
    expect(settlements).toHaveLength(0);
  });

  it('excludes expenses from closed trips', () => {
    const closedTrip = tripFactory({ id: 't1', groupId: 'g1', status: 'closed' });
    const tripExpense = expenseFactory({
      id: 'e1', tripId: 't1', groupId: undefined, currency: CURRENCY,
      totalAmountCents: 2000, paidByUserId: 'u1', settledAt: null,
      splits: [makeSplit('u1', 1000), makeSplit('u2', 1000)],
    });

    const { settlements, memberBalances } = computeGroupBalances(
      ['u1', 'u2'],
      [closedTrip],
      { t1: [tripExpense] },
      [],
    );

    expect(settlements).toHaveLength(0);
    expect(memberBalances.every(b => b.balanceCents === 0)).toBe(true);
  });
});
