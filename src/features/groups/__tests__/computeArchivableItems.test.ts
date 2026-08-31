import { computeArchivableItems } from '../utils/computeArchivableItems';
import { tripFactory, expenseFactory } from '../../../__testUtils__/factories';
import type { LedgerPayment } from '../../../core/logic/settlement';

const CURRENCY = 'EUR';

function makeSplit(userId: string, amountOwedCents: number) {
  return { id: `s-${userId}`, expenseId: '', userId, amountOwedCents, amountPaidCents: 0, settledAt: undefined };
}

function daysAgo(n: number): Date {
  return new Date(2026, 0, 30 - n);
}

describe('computeArchivableItems', () => {
  it('marks a group expense archivable once the debtor has no remaining balance', () => {
    const expense = expenseFactory({
      id: 'e1', groupId: 'g1', tripId: undefined, currency: CURRENCY,
      totalAmountCents: 2000, paidByUserId: 'u1', createdAt: daysAgo(1),
      splits: [makeSplit('u1', 1000), makeSplit('u2', 1000)],
    });
    const payments: LedgerPayment[] = [
      { payerUserId: 'u2', payeeUserId: 'u1', amountCents: 1000, currency: CURRENCY },
    ];

    const { archivableExpenseIds } = computeArchivableItems(['u1', 'u2'], [], {}, [expense], payments);

    expect(archivableExpenseIds.has('e1')).toBe(true);
  });

  it('does not mark an expense archivable while the debtor still owes on it', () => {
    const expense = expenseFactory({
      id: 'e1', groupId: 'g1', tripId: undefined, currency: CURRENCY,
      totalAmountCents: 2000, paidByUserId: 'u1', createdAt: daysAgo(1),
      splits: [makeSplit('u1', 1000), makeSplit('u2', 1000)],
    });

    const { archivableExpenseIds } = computeArchivableItems(['u1', 'u2'], [], {}, [expense], []);

    expect(archivableExpenseIds.has('e1')).toBe(false);
  });

  it('only clears the older of two expenses when a payment covers just the newer debt', () => {
    // u2 owes 1000 on the older expense and 1500 on the newer one (2500 total).
    // A 1500 payment covers the newer expense entirely, walking backward from
    // "now" — so the older expense must have already been paid off first.
    const older = expenseFactory({
      id: 'e-older', groupId: 'g1', tripId: undefined, currency: CURRENCY,
      totalAmountCents: 2000, paidByUserId: 'u1', createdAt: daysAgo(10),
      splits: [makeSplit('u1', 1000), makeSplit('u2', 1000)],
    });
    const newer = expenseFactory({
      id: 'e-newer', groupId: 'g1', tripId: undefined, currency: CURRENCY,
      totalAmountCents: 3000, paidByUserId: 'u1', createdAt: daysAgo(1),
      splits: [makeSplit('u1', 1500), makeSplit('u2', 1500)],
    });
    const payments: LedgerPayment[] = [
      { payerUserId: 'u2', payeeUserId: 'u1', amountCents: 1000, currency: CURRENCY },
    ];

    const { archivableExpenseIds } = computeArchivableItems(
      ['u1', 'u2'], [], {}, [older, newer], payments,
    );

    expect(archivableExpenseIds.has('e-older')).toBe(true);
    expect(archivableExpenseIds.has('e-newer')).toBe(false);
  });

  it('does not archive an expense that still has an outstanding debtor, even if another debtor is clear', () => {
    // Three-person expense: u1 paid, u2 and u3 each owe 500. Only u2 pays up.
    const expense = expenseFactory({
      id: 'e1', groupId: 'g1', tripId: undefined, currency: CURRENCY,
      totalAmountCents: 1500, paidByUserId: 'u1', createdAt: daysAgo(1),
      splits: [makeSplit('u1', 500), makeSplit('u2', 500), makeSplit('u3', 500)],
    });
    const payments: LedgerPayment[] = [
      { payerUserId: 'u2', payeeUserId: 'u1', amountCents: 500, currency: CURRENCY },
    ];

    const { archivableExpenseIds } = computeArchivableItems(
      ['u1', 'u2', 'u3'], [], {}, [expense], payments,
    );

    expect(archivableExpenseIds.has('e1')).toBe(false);
  });

  it('rolls a trip up into a single item dated at its most recent expense', () => {
    const trip = tripFactory({ id: 't1', groupId: 'g1', status: 'active', createdAt: daysAgo(20) });
    const tripExpenseOld = expenseFactory({
      id: 'te1', tripId: 't1', groupId: undefined, currency: CURRENCY,
      totalAmountCents: 1000, paidByUserId: 'u1', createdAt: daysAgo(15),
      splits: [makeSplit('u1', 500), makeSplit('u2', 500)],
    });
    const tripExpenseNew = expenseFactory({
      id: 'te2', tripId: 't1', groupId: undefined, currency: CURRENCY,
      totalAmountCents: 1000, paidByUserId: 'u1', createdAt: daysAgo(1),
      splits: [makeSplit('u1', 500), makeSplit('u2', 500)],
    });
    const payments: LedgerPayment[] = [
      { payerUserId: 'u2', payeeUserId: 'u1', amountCents: 1000, currency: CURRENCY },
    ];

    const { archivableTripIds } = computeArchivableItems(
      ['u1', 'u2'], [trip], { t1: [tripExpenseOld, tripExpenseNew] }, [], payments,
    );

    expect(archivableTripIds.has('t1')).toBe(true);
  });

  it('leaves a trip un-archivable while any of its own debt is still outstanding', () => {
    const trip = tripFactory({ id: 't1', groupId: 'g1', status: 'active', createdAt: daysAgo(20) });
    const tripExpense = expenseFactory({
      id: 'te1', tripId: 't1', groupId: undefined, currency: CURRENCY,
      totalAmountCents: 2000, paidByUserId: 'u1', createdAt: daysAgo(5),
      splits: [makeSplit('u1', 1000), makeSplit('u2', 1000)],
    });

    const { archivableTripIds } = computeArchivableItems(
      ['u1', 'u2'], [trip], { t1: [tripExpense] }, [], [],
    );

    expect(archivableTripIds.has('t1')).toBe(false);
  });

  it('treats an expense with no outstanding splits as trivially archivable', () => {
    const expense = expenseFactory({
      id: 'e1', groupId: 'g1', tripId: undefined, currency: CURRENCY,
      totalAmountCents: 1000, paidByUserId: 'u1', createdAt: daysAgo(1),
      splits: [makeSplit('u1', 0)],
    });

    const { archivableExpenseIds } = computeArchivableItems(['u1'], [], {}, [expense], []);

    expect(archivableExpenseIds.has('e1')).toBe(true);
  });

  it('returns empty sets when there is nothing to evaluate', () => {
    const { archivableExpenseIds, archivableTripIds } = computeArchivableItems(['u1', 'u2'], [], {}, [], []);
    expect(archivableExpenseIds.size).toBe(0);
    expect(archivableTripIds.size).toBe(0);
  });
});
