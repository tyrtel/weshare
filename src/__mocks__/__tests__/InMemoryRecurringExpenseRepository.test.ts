import { InMemoryRecurringExpenseRepository } from '../InMemoryRecurringExpenseRepository';
import { recurringExpenseFactory, recurringExpenseSplitFactory } from '../../__testUtils__/factories';

const GROUP_ID = 'g1';
const OTHER_GROUP = 'g2';

function makeRepo() {
  return new InMemoryRecurringExpenseRepository();
}

describe('InMemoryRecurringExpenseRepository', () => {
  it('returns empty array for a group with no templates', async () => {
    const repo = makeRepo();
    const result = await repo.getRecurringExpensesForGroup(GROUP_ID);
    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toEqual([]);
  });

  it('saves and retrieves a recurring expense with splits', async () => {
    const repo = makeRepo();
    const split = recurringExpenseSplitFactory({ id: 's1', recurringExpenseId: 're-1' });
    const re = recurringExpenseFactory({ splits: [split] });

    const saved = await repo.saveRecurringExpense(re);
    expect(saved.ok).toBe(true);

    const fetched = await repo.getRecurringExpensesForGroup(GROUP_ID);
    expect(fetched.ok && fetched.value).toHaveLength(1);
    expect(fetched.ok && fetched.value[0].splits).toHaveLength(1);
    expect(fetched.ok && fetched.value[0].splits[0].userId).toBe('u1');
  });

  it('filters by groupId', async () => {
    const repo = makeRepo();
    const re1 = recurringExpenseFactory({ id: 're-1', groupId: GROUP_ID });
    const re2 = recurringExpenseFactory({ id: 're-2', groupId: OTHER_GROUP });
    await repo.saveRecurringExpense(re1);
    await repo.saveRecurringExpense(re2);

    const result = await repo.getRecurringExpensesForGroup(GROUP_ID);
    expect(result.ok && result.value).toHaveLength(1);
    expect(result.ok && result.value[0].id).toBe('re-1');
  });

  it('updates a recurring expense and replaces splits', async () => {
    const repo = makeRepo();
    const re = recurringExpenseFactory({
      splits: [recurringExpenseSplitFactory({ id: 's1' })],
    });
    await repo.saveRecurringExpense(re);

    const updated = { ...re, description: 'Updated rent', splits: [recurringExpenseSplitFactory({ id: 's2', amountOwedCents: 4000 })] };
    const result = await repo.updateRecurringExpense(updated);
    expect(result.ok).toBe(true);
    expect(result.ok && result.value.description).toBe('Updated rent');
    expect(result.ok && result.value.splits[0].id).toBe('s2');
  });

  it('returns NotFoundError when updating a non-existent template', async () => {
    const repo = makeRepo();
    const result = await repo.updateRecurringExpense(recurringExpenseFactory({ id: 'nope' }));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.kind).toBe('NotFoundError');
  });

  it('deletes a recurring expense and its splits', async () => {
    const repo = makeRepo();
    const re = recurringExpenseFactory({ splits: [recurringExpenseSplitFactory()] });
    await repo.saveRecurringExpense(re);

    const deleted = await repo.deleteRecurringExpense(re.id);
    expect(deleted.ok).toBe(true);

    const fetched = await repo.getRecurringExpensesForGroup(GROUP_ID);
    expect(fetched.ok && fetched.value).toHaveLength(0);
  });

  it('returns NotFoundError when deleting a non-existent template', async () => {
    const repo = makeRepo();
    const result = await repo.deleteRecurringExpense('nope');
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.kind).toBe('NotFoundError');
  });

  it('pauses a recurring expense', async () => {
    const repo = makeRepo();
    await repo.saveRecurringExpense(recurringExpenseFactory({ pausedAt: null }));

    const result = await repo.pauseRecurringExpense('re-1');
    expect(result.ok).toBe(true);
    expect(result.ok && result.value.pausedAt).toBeInstanceOf(Date);
  });

  it('resumes a paused recurring expense', async () => {
    const repo = makeRepo();
    await repo.saveRecurringExpense(recurringExpenseFactory({ pausedAt: new Date() }));

    const result = await repo.resumeRecurringExpense('re-1');
    expect(result.ok).toBe(true);
    expect(result.ok && result.value.pausedAt).toBeNull();
  });

  it('returns NotFoundError when pausing a non-existent template', async () => {
    const repo = makeRepo();
    const result = await repo.pauseRecurringExpense('nope');
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.kind).toBe('NotFoundError');
  });

  it('seed initialises templates and splits', async () => {
    const split = recurringExpenseSplitFactory({ id: 's1', recurringExpenseId: 're-1' });
    const repo = makeRepo().seed([recurringExpenseFactory({ splits: [split] })]);

    const result = await repo.getRecurringExpensesForGroup(GROUP_ID);
    expect(result.ok && result.value).toHaveLength(1);
    expect(result.ok && result.value[0].splits).toHaveLength(1);
  });
});
