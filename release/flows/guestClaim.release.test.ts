import { waitFor } from '@testing-library/react-native';
import { useCreateGroup } from '../../src/features/groups/hooks/useCreateGroup';
import { useAddGroupMember } from '../../src/features/groups/hooks/useAddGroupMember';
import { useCreateGroupExpense } from '../../src/features/groups/hooks/useCreateGroupExpense';
import { useCreateTrip } from '../../src/features/trips/hooks/useCreateTrip';
import { MEMBER_REPO } from '../../src/core/di/tokens';
import type { Expense } from '../../src/core/models/Expense';
import { admin, closeClient, container, createUser, renderAppHook, run, TestUser, uniqueEmail } from '../support';

// A guest added to a group by email is merged into the real account when that
// person signs up (merge_guest_records_for_new_user, run on every sign-in).
// Before 048 the merge failed silently on the uuid columns.
describe('guest becomes a real account', () => {
  const guestEmail = uniqueEmail('Sam');
  let owner: TestUser;
  let guestId: string;
  let groupId: string;
  let expense: Expense;
  let sam: TestUser;

  beforeAll(async () => {
    owner = await createUser('Owner');

    const { result: create } = await renderAppHook(() => useCreateGroup());
    groupId = (await run(() => create.current.createGroup('Trip fund', 'EUR')))!.id;

    const { result: add } = await renderAppHook(() => useAddGroupMember(groupId));
    guestId = (await run(() => add.current.addMember({ displayName: 'Sam', email: guestEmail })))!.userId;

    const { result: spend } = await renderAppHook(() => useCreateGroupExpense(groupId));
    expense = (await run(() => spend.current.createGroupExpense({
      description: 'Fuel', totalAmountCents: 5000, currency: 'EUR', paidByUserId: guestId,
      splits: [{ userId: owner.id, amountOwedCents: 2500 }, { userId: guestId, amountOwedCents: 2500 }],
    })))!;

    sam = await createUser('Sam', { email: guestEmail });
  });

  afterAll(closeClient);

  it('the guest membership becomes the new account', async () => {
    await waitFor(async () => {
      const { data } = await admin.from('group_members').select('user_id, is_guest').eq('group_id', groupId);
      expect(data!.map(m => m.user_id).sort()).toEqual([owner.id, sam.id].sort());
      expect(data!.every(m => m.is_guest === false)).toBe(true);
    }, { timeout: 5000 });
  });

  it("the guest's expenses and splits move to the new account", async () => {
    const { data: exp } = await admin.from('expenses').select('paid_by_user_id').eq('id', expense.id).single();
    expect(exp!.paid_by_user_id).toBe(sam.id);

    const { data: splits } = await admin.from('splits').select('user_id').eq('expense_id', expense.id);
    expect(splits!.map(s => s.user_id).sort()).toEqual([owner.id, sam.id].sort());
  });
});

// Same merge for a trip guest. Before 051 claim_member_slot compared the uuid
// trip_id to its text parameter and failed on every call.
describe('trip guest becomes a real account', () => {
  const guestEmail = uniqueEmail('Kim');
  let owner: TestUser;
  let tripId: string;
  let kim: TestUser;

  beforeAll(async () => {
    owner = await createUser('Owner');
    const { result } = await renderAppHook(() => useCreateTrip());
    tripId = (await run(() => result.current.createTrip('Lyon', 'EUR')))!.id;

    const added = await (await container()).resolve(MEMBER_REPO).addMember({
      userId: 'guest_kim', tripId, displayName: 'Kim', isGuest: true, joinedAt: new Date(), email: guestEmail,
    });
    expect(added.ok).toBe(true);

    kim = await createUser('Kim', { email: guestEmail });
  });

  afterAll(closeClient);

  it('the guest trip membership becomes the new account', async () => {
    await waitFor(async () => {
      const { data } = await admin.from('trip_members').select('user_id').eq('trip_id', tripId);
      expect(data!.map(m => m.user_id).sort()).toEqual([owner.id, kim.id].sort());
    }, { timeout: 5000 });
  });
});
