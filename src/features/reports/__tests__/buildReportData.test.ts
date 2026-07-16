import { buildTripReportData } from '../utils/buildTripReportData';
import { buildGroupReportData } from '../utils/buildGroupReportData';
import { MockReceiptStorage } from '../../../__mocks__/MockReceiptStorage';
import {
  tripFactory, memberFactory, expenseFactory, splitFactory,
  groupFactory, groupMemberFactory, splitRequestFactory,
} from '../../../__testUtils__/factories';

describe('buildTripReportData', () => {
  it('includes every expense with resolved receipt URLs and payer/split names', async () => {
    const trip = tripFactory({
      members: [memberFactory({ userId: 'u1', displayName: 'Alice' }), memberFactory({ userId: 'u2', displayName: 'Bob' })],
    });
    const expense = expenseFactory({
      paidByUserId: 'u1',
      metadata: { receiptUrl: 'u1/e1.jpg' },
      splits: [splitFactory({ userId: 'u1', amountOwedCents: 3000 }), splitFactory({ userId: 'u2', amountOwedCents: 3000 })],
    });

    const data = await buildTripReportData(trip, [expense], [], new MockReceiptStorage());

    expect(data.title).toBe(trip.name);
    expect(data.expenses).toHaveLength(1);
    expect(data.expenses[0].payerName).toBe('Alice');
    expect(data.expenses[0].splits.map(s => s.displayName).sort()).toEqual(['Alice', 'Bob']);
    expect(data.expenses[0].receiptUrl).toContain('u1/e1.jpg');
  });

  it('produces a settlement entry for an outstanding debt with no split request', async () => {
    const trip = tripFactory({
      members: [memberFactory({ userId: 'u1', displayName: 'Alice' }), memberFactory({ userId: 'u2', displayName: 'Bob' })],
    });
    const expense = expenseFactory({
      paidByUserId: 'u1',
      splits: [splitFactory({ userId: 'u1', amountOwedCents: 0 }), splitFactory({ userId: 'u2', amountOwedCents: 3000 })],
    });

    const data = await buildTripReportData(trip, [expense], [], new MockReceiptStorage());

    expect(data.settlements).toHaveLength(1);
    expect(data.settlements[0]).toMatchObject({ fromDisplayName: 'Bob', toDisplayName: 'Alice', status: 'outstanding' });
  });

  it('reflects the latest split request status for a pair', async () => {
    const trip = tripFactory({
      members: [memberFactory({ userId: 'u1', displayName: 'Alice' }), memberFactory({ userId: 'u2', displayName: 'Bob' })],
    });
    const expense = expenseFactory({
      paidByUserId: 'u1',
      splits: [splitFactory({ userId: 'u1', amountOwedCents: 0 }), splitFactory({ userId: 'u2', amountOwedCents: 3000 })],
    });
    const request = splitRequestFactory({ payerUserId: 'u2', requesterUserId: 'u1', status: 'declined' });

    const data = await buildTripReportData(trip, [expense], [request], new MockReceiptStorage());

    expect(data.settlements[0].status).toBe('declined');
  });

  it('leaves receiptUrl null when the expense has no receipt', async () => {
    const trip = tripFactory({ members: [memberFactory()] });
    const expense = expenseFactory({ metadata: {} });

    const data = await buildTripReportData(trip, [expense], [], new MockReceiptStorage());

    expect(data.expenses[0].receiptUrl).toBeNull();
  });
});

describe('buildGroupReportData', () => {
  const JAN  = new Date('2026-01-15T00:00:00Z');
  const FEB  = new Date('2026-02-10T00:00:00Z');

  it('filters expenses to the selected month', async () => {
    const group = groupFactory({
      members: [groupMemberFactory({ userId: 'u1', displayName: 'Alice' }), groupMemberFactory({ userId: 'u2', displayName: 'Bob' })],
    });
    const janExpense = expenseFactory({ id: 'e-jan', groupId: 'g1', tripId: undefined, createdAt: JAN });
    const febExpense = expenseFactory({ id: 'e-feb', groupId: 'g1', tripId: undefined, createdAt: FEB });

    const data = await buildGroupReportData(group, [janExpense, febExpense], [], JAN, new MockReceiptStorage());

    expect(data.expenses).toHaveLength(1);
    expect(data.expenses[0].id).toBe('e-jan');
  });

  it('tags a trip-sourced expense with its trip name, and leaves direct expenses untagged', async () => {
    const group = groupFactory({
      members: [groupMemberFactory({ userId: 'u1', displayName: 'Alice' }), groupMemberFactory({ userId: 'u2', displayName: 'Bob' })],
    });
    const trip = tripFactory({ id: 't1', name: 'Weekend Getaway', groupId: 'g1' });
    const directExpense = expenseFactory({ id: 'e-direct', groupId: 'g1', tripId: undefined, createdAt: JAN, description: 'Rent' });
    const tripExpense   = expenseFactory({ id: 'e-trip', tripId: 't1', groupId: undefined, createdAt: JAN, description: 'Taxi' });

    const data = await buildGroupReportData(group, [directExpense, tripExpense], [], JAN, new MockReceiptStorage(), [trip]);

    const direct = data.expenses.find(e => e.id === 'e-direct');
    const fromTrip = data.expenses.find(e => e.id === 'e-trip');
    expect(direct?.tripName).toBeUndefined();
    expect(fromTrip?.tripName).toBe('Weekend Getaway');
  });

  it('scopes the settlement summary to the same month, ignoring payments from other months', async () => {
    const group = groupFactory({
      members: [groupMemberFactory({ userId: 'u1', displayName: 'Alice' }), groupMemberFactory({ userId: 'u2', displayName: 'Bob' })],
    });
    const janExpense = expenseFactory({
      id: 'e-jan', groupId: 'g1', tripId: undefined, createdAt: JAN, paidByUserId: 'u1',
      splits: [splitFactory({ userId: 'u1', amountOwedCents: 0 }), splitFactory({ userId: 'u2', amountOwedCents: 3000 })],
    });
    // A payment recorded in February shouldn't offset January's balance in a month-scoped report.
    const febPayment = splitRequestFactory({
      groupId: 'g1', tripId: undefined, payerUserId: 'u2', requesterUserId: 'u1',
      status: 'paid', amountCents: 3000, createdAt: FEB, updatedAt: FEB,
    });

    const data = await buildGroupReportData(group, [janExpense], [febPayment], JAN, new MockReceiptStorage());

    expect(data.settlements).toHaveLength(1);
    expect(data.settlements[0]).toMatchObject({ fromDisplayName: 'Bob', toDisplayName: 'Alice', status: 'outstanding' });
  });

  it('includes the month in the subtitle', async () => {
    const group = groupFactory({ members: [groupMemberFactory()] });
    const data = await buildGroupReportData(group, [], [], JAN, new MockReceiptStorage());
    expect(data.subtitle).toContain('2026');
  });
});
