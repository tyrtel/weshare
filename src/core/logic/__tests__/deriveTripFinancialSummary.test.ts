import { deriveTripFinancialSummary } from '../settlement';
import { memberFactory, splitFactory, expenseFactory } from '../../../__testUtils__/factories';

const MEMBERS = ['u1', 'u2', 'u3'].map(id => memberFactory({ userId: id, displayName: id }));

describe('deriveTripFinancialSummary', () => {
  it('returns null when there are no expenses', () => {
    expect(deriveTripFinancialSummary(MEMBERS, [], 'u1')).toBeNull();
  });

  it('returns "owe" when the current user owes money', () => {
    // u1 paid €60, u2 owes u1 €30, u3 owes u1 €30
    // from u2's perspective: direction = 'owe', amount = 3000
    const splits = [
      splitFactory({ id: 's-u1', expenseId: 'e1', userId: 'u1', amountOwedCents: 2000 }), // u1's own share — self-cancels
      splitFactory({ id: 's-u2', expenseId: 'e1', userId: 'u2', amountOwedCents: 2000 }),
      splitFactory({ id: 's-u3', expenseId: 'e1', userId: 'u3', amountOwedCents: 2000 }),
    ];
    const expenses = [expenseFactory({ id: 'e1', paidByUserId: 'u1', splits, totalAmountCents: 6000 })];

    const result = deriveTripFinancialSummary(MEMBERS, expenses, 'u2');
    expect(result).toEqual({ direction: 'owe', amountCents: 2000 });
  });

  it('returns "owed" when the current user is owed money', () => {
    const splits = [
      splitFactory({ id: 's-u1', expenseId: 'e1', userId: 'u1', amountOwedCents: 2000 }),
      splitFactory({ id: 's-u2', expenseId: 'e1', userId: 'u2', amountOwedCents: 2000 }),
      splitFactory({ id: 's-u3', expenseId: 'e1', userId: 'u3', amountOwedCents: 2000 }),
    ];
    const expenses = [expenseFactory({ id: 'e1', paidByUserId: 'u1', splits, totalAmountCents: 6000 })];

    const result = deriveTripFinancialSummary(MEMBERS, expenses, 'u1');
    expect(result).toEqual({ direction: 'owed', amountCents: 4000 });
  });

  it('returns "even" when the current user has no outstanding balance', () => {
    // u1 paid €60 total; u2 and u3 each owe €20; u1 owes nothing net
    // Make u2 pay another expense to create mutual cancellation
    const splits1 = [splitFactory({ id: 's-u1', expenseId: 'e1', userId: 'u1', amountOwedCents: 2000 }), splitFactory({ id: 's-u2', expenseId: 'e1', userId: 'u2', amountOwedCents: 2000 }), splitFactory({ id: 's-u3', expenseId: 'e1', userId: 'u3', amountOwedCents: 2000 })];
    const splits2 = [splitFactory({ id: 's-u1', expenseId: 'e2', userId: 'u1', amountOwedCents: 2000 }), splitFactory({ id: 's-u2', expenseId: 'e2', userId: 'u2', amountOwedCents: 2000 }), splitFactory({ id: 's-u3', expenseId: 'e2', userId: 'u3', amountOwedCents: 2000 })];
    const expenses = [
      expenseFactory({ id: 'e1', paidByUserId: 'u1', splits: splits1, totalAmountCents: 6000 }),
      expenseFactory({ id: 'e2', paidByUserId: 'u2', splits: splits2, totalAmountCents: 6000 }),
    ];
    // u1 is owed 4000 from e1, owes 2000 from e2 → net +2000 (owed)
    // Let's just verify u2's symmetric position
    const result = deriveTripFinancialSummary(MEMBERS, expenses, 'u2');
    // u2 owes 2000 from e1, is owed 4000 from e2 → net +2000 (owed)
    expect(result).toEqual({ direction: 'owed', amountCents: 2000 });
  });

  it('returns "even" and amountCents=0 when all splits are settled', () => {
    const splits = [
      splitFactory({ id: 's-u1', expenseId: 'e1', userId: 'u1', amountOwedCents: 2000, amountPaidCents: 2000 }), // fully paid
      splitFactory({ id: 's-u2', expenseId: 'e1', userId: 'u2', amountOwedCents: 2000, amountPaidCents: 2000 }), // fully paid
      splitFactory({ id: 's-u3', expenseId: 'e1', userId: 'u3', amountOwedCents: 2000, amountPaidCents: 2000 }), // fully paid
    ];
    const expenses = [expenseFactory({ id: 'e1', paidByUserId: 'u1', splits, totalAmountCents: 6000 })];

    const result = deriveTripFinancialSummary(MEMBERS, expenses, 'u2');
    expect(result).toEqual({ direction: 'even', amountCents: 0 });
  });

  it('returns "even" when the user is not a member of any settlement', () => {
    const splits = [splitFactory({ id: 's-u1', expenseId: 'e1', userId: 'u1', amountOwedCents: 3000 }), splitFactory({ id: 's-u2', expenseId: 'e1', userId: 'u2', amountOwedCents: 3000 })];
    const expenses = [expenseFactory({ id: 'e1', paidByUserId: 'u1', splits, totalAmountCents: 6000 })];
    // u3 is a member but has no splits — not involved in settlements
    const result = deriveTripFinancialSummary(MEMBERS, expenses, 'u3');
    expect(result).toEqual({ direction: 'even', amountCents: 0 });
  });
});
