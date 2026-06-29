import { InMemoryExpenseRepository } from '../InMemoryExpenseRepository';
import { expenseFactory } from '../../__testUtils__/factories';

describe('InMemoryExpenseRepository — group methods', () => {
  let repo: InMemoryExpenseRepository;

  beforeEach(() => {
    repo = new InMemoryExpenseRepository();
  });

  describe('getExpensesForGroup', () => {
    it('returns only expenses belonging to the given group', async () => {
      const groupExpense  = expenseFactory({ id: 'e1', groupId: 'g1', tripId: undefined });
      const otherExpense  = expenseFactory({ id: 'e2', groupId: 'g2', tripId: undefined });
      const tripExpense   = expenseFactory({ id: 'e3', tripId: 't1', groupId: undefined });
      repo.seed([groupExpense, otherExpense, tripExpense]);

      const result = await repo.getExpensesForGroup('g1');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0].id).toBe('e1');
      }
    });

    it('returns empty array when group has no expenses', async () => {
      const result = await repo.getExpensesForGroup('g-none');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toHaveLength(0);
    });
  });

  describe('settleExpense', () => {
    it('sets settledAt on the expense', async () => {
      const expense = expenseFactory({ id: 'e1', groupId: 'g1', tripId: undefined, settledAt: null });
      await repo.saveExpense(expense);

      const settledAt = new Date('2026-07-01T10:00:00Z');
      const result = await repo.settleExpense('e1', settledAt);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.settledAt).toEqual(settledAt);
    });

    it('persists the settledAt so subsequent reads reflect it', async () => {
      const expense = expenseFactory({ id: 'e1', groupId: 'g1', tripId: undefined, settledAt: null });
      await repo.saveExpense(expense);

      const settledAt = new Date('2026-07-01T10:00:00Z');
      await repo.settleExpense('e1', settledAt);

      const fetched = await repo.getExpense('e1');
      expect(fetched.ok).toBe(true);
      if (fetched.ok) expect(fetched.value.settledAt).toEqual(settledAt);
    });

    it('returns NotFoundError for unknown expense id', async () => {
      const result = await repo.settleExpense('ghost', new Date());
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('NotFoundError');
    });
  });
});
