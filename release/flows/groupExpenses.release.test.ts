import { useCreateGroup } from '../../src/features/groups/hooks/useCreateGroup';
import { useAddGroupMember } from '../../src/features/groups/hooks/useAddGroupMember';
import { useCreateGroupExpense } from '../../src/features/groups/hooks/useCreateGroupExpense';
import { EXPENSE_REPO } from '../../src/core/di/tokens';
import { generateId } from '../../src/core/utils/generateId';
import { admin, closeClient, container, createUser, renderAppHook, run, signInAs, TestUser } from '../support';

// Regression for migrations 047 (no RLS policy for group expenses) and 048
// (guest_<uuid> ids rejected by uuid columns): both reached production because
// the unit tests run against in-memory repositories.
describe('group one-time expenses', () => {
  let owner: TestUser;
  let outsider: TestUser;
  let groupId: string;
  let guestId: string;

  beforeAll(async () => {
    outsider = await createUser('Outsider');
    owner = await createUser('Owner');
  });

  afterAll(closeClient);

  it('owner creates a group and adds a guest member', async () => {
    const { result: create } = await renderAppHook(() => useCreateGroup());
    const group = await run(() => create.current.createGroup('Flat share', 'EUR'));
    expect(create.current.error).toBeNull();
    groupId = group!.id;

    const { result: add } = await renderAppHook(() => useAddGroupMember(groupId));
    const guest = await run(() => add.current.addMember({ displayName: 'Guest' }));
    expect(add.current.error).toBeNull();
    guestId = guest!.userId;
    expect(guestId).toMatch(/^guest_/);
  });

  it('saves an expense paid by the owner and split with the guest', async () => {
    const { result } = await renderAppHook(() => useCreateGroupExpense(groupId));
    const expense = await run(() => result.current.createGroupExpense({
      description: 'Groceries', totalAmountCents: 3000, currency: 'EUR', paidByUserId: owner.id,
      splits: [{ userId: owner.id, amountOwedCents: 1500 }, { userId: guestId, amountOwedCents: 1500 }],
    }));
    expect(result.current.error).toBeNull();
    expect(expense?.splits).toHaveLength(2);
  });

  it('saves an expense paid by the guest', async () => {
    const { result } = await renderAppHook(() => useCreateGroupExpense(groupId));
    await run(() => result.current.createGroupExpense({
      description: 'Taxi', totalAmountCents: 1000, currency: 'EUR', paidByUserId: guestId,
      splits: [{ userId: owner.id, amountOwedCents: 500 }, { userId: guestId, amountOwedCents: 500 }],
    }));
    expect(result.current.error).toBeNull();
  });

  it('reads both expenses and their splits back from the database', async () => {
    const repo = (await container()).resolve(EXPENSE_REPO);
    const result = await repo.getExpensesForGroup(groupId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map(e => e.description).sort()).toEqual(['Groceries', 'Taxi']);
    expect(result.value.every(e => e.splits.length === 2)).toBe(true);
  });

  it('logs an activity event for each expense', async () => {
    const { data, error } = await admin.from('activity_events').select('event_type').eq('group_id', groupId);
    expect(error).toBeNull();
    expect(data).toEqual([{ event_type: 'expense.created' }, { event_type: 'expense.created' }]);
  });

  it('a non-member can neither read nor add group expenses', async () => {
    await signInAs(outsider);
    const repo = (await container()).resolve(EXPENSE_REPO);

    const read = await repo.getExpensesForGroup(groupId);
    expect(read.ok && read.value).toEqual([]);

    const write = await repo.saveExpense({
      id: generateId(), groupId, description: 'Sneaky', totalAmountCents: 100, currency: 'EUR',
      paidByUserId: outsider.id, createdAt: new Date(), settledAt: null, splits: [], metadata: {},
    });
    expect(write.ok).toBe(false);
  });
});
