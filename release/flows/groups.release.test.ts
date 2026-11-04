import { waitFor } from '@testing-library/react-native';
import { useCreateGroup } from '../../src/features/groups/hooks/useCreateGroup';
import { useCreateGroupExpense } from '../../src/features/groups/hooks/useCreateGroupExpense';
import { useCreateRecurringExpense } from '../../src/features/groups/hooks/useCreateRecurringExpense';
import { useGroupActivityFeed } from '../../src/features/history/hooks/useGroupActivityFeed';
import { GROUP_REPO, SPLIT_REQUEST_REPO } from '../../src/core/di/tokens';
import { generateId } from '../../src/core/utils/generateId';
import type { Group } from '../../src/core/models/Group';
import type { SplitRequest } from '../../src/core/models/SplitRequest';
import { admin, closeClient, container, createUser, renderAppHook, run, signInAs, TestUser } from '../support';

function tomorrow(): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

describe('groups', () => {
  let owner: TestUser;
  let member: TestUser;
  let outsider: TestUser;
  let group: Group;

  beforeAll(async () => {
    outsider = await createUser('Outsider');
    member = await createUser('Member');
    owner = await createUser('Owner');
  });

  afterAll(closeClient);

  describe('free-tier group limit', () => {
    it('a free user can create their first group', async () => {
      const { result } = await renderAppHook(() => useCreateGroup());
      group = (await run(() => result.current.createGroup('House', 'EUR')))!;
      expect(result.current.error).toBeNull();
      expect(group).toBeTruthy();
    });

    it('the app stops a free user creating a second group', async () => {
      const { result } = await renderAppHook(() => useCreateGroup());
      const second = await run(() => result.current.createGroup('Second', 'EUR'));
      expect(second).toBeNull();
      expect(result.current.limitReached).toBe(true);
    });

    it('the database refuses a second group even if the app check is skipped', async () => {
      const saved = await (await container()).resolve(GROUP_REPO).saveGroup({
        ...group, id: generateId(), name: 'Bypass', members: [],
      });
      expect(saved.ok).toBe(false);
    });
  });

  describe('membership and visibility', () => {
    it('the owner adds a member', async () => {
      const added = await (await container()).resolve(GROUP_REPO).addMember({
        userId: member.id, groupId: group.id, displayName: member.name, isGuest: false, joinedAt: new Date(),
      });
      expect(added.ok).toBe(true);
    });

    it('the member sees the group', async () => {
      await signInAs(member);
      const groups = await (await container()).resolve(GROUP_REPO).getGroupsForUser(member.id);
      expect(groups.ok && groups.value.map(g => g.id)).toEqual([group.id]);
    });

    it('a non-member cannot read the group', async () => {
      await signInAs(outsider);
      expect((await (await container()).resolve(GROUP_REPO).getGroup(group.id)).ok).toBe(false);
    });
  });

  describe('recurring expenses', () => {
    const input = () => ({
      description: 'Rent', totalAmountCents: 100000, currency: 'EUR', paidByUserId: owner.id,
      period: 'monthly' as const, startDate: tomorrow(), createdByUserId: owner.id,
      splits: [{ userId: owner.id, amountOwedCents: 50000 }, { userId: member.id, amountOwedCents: 50000 }],
    });

    it('the first recurring rule in a group is free', async () => {
      await signInAs(owner);
      const { result } = await renderAppHook(() => useCreateRecurringExpense(group.id));
      await run(() => result.current.createRecurringExpense(input()));
      expect(result.current.error).toBeNull();
      expect(result.current.limitReached).toBe(false);

      const { data } = await admin.from('recurring_expenses').select('description').eq('group_id', group.id);
      expect(data).toEqual([{ description: 'Rent' }]);
    });

    it('a second rule hits the free limit, for any member', async () => {
      await signInAs(member);
      const { result } = await renderAppHook(() => useCreateRecurringExpense(group.id));
      await run(() => result.current.createRecurringExpense({ ...input(), description: 'Internet', createdByUserId: member.id }));
      expect(result.current.limitReached).toBe(true);
    });
  });

  describe('history feed', () => {
    it('a member sees expense events in the group feed', async () => {
      await signInAs(owner);
      const { result: add } = await renderAppHook(() => useCreateGroupExpense(group.id));
      await run(() => add.current.createGroupExpense({
        description: 'Cleaning', totalAmountCents: 4000, currency: 'EUR', paidByUserId: owner.id,
        splits: [{ userId: owner.id, amountOwedCents: 2000 }, { userId: member.id, amountOwedCents: 2000 }],
      }));
      expect(add.current.error).toBeNull();

      await signInAs(member);
      const { result: feed } = await renderAppHook(() => useGroupActivityFeed(group.id));
      await waitFor(() => expect(feed.current.loading).toBe(false));
      expect(feed.current.error).toBeNull();
      expect(feed.current.events.map(e => e.eventType)).toContain('expense.created');
    });

    it('a non-member sees nothing in the group feed', async () => {
      await signInAs(outsider);
      const { result: feed } = await renderAppHook(() => useGroupActivityFeed(group.id));
      await waitFor(() => expect(feed.current.loading).toBe(false));
      expect(feed.current.events).toEqual([]);
    });
  });

  describe('split requests (recorded payments)', () => {
    const request = (): SplitRequest => ({
      id: generateId(), groupId: group.id, requesterUserId: owner.id, payerUserId: member.id,
      amountCents: 2000, currency: 'EUR', note: 'Cleaning', status: 'pending', preferredWallet: 'other',
      externalRefId: null, stripePaymentLinkId: null, stripeSessionId: null, obPaymentId: null,
      obProvider: null, rolledOverFromTripId: null, createdAt: new Date(), updatedAt: new Date(),
    });
    let saved: SplitRequest;

    it('a member records a payment request in the group', async () => {
      await signInAs(member);
      const result = await (await container()).resolve(SPLIT_REQUEST_REPO).saveSplitRequest(request());
      expect(result.ok).toBe(true);
      if (result.ok) saved = result.value;
    });

    it('another member can read it and mark it paid', async () => {
      await signInAs(owner);
      const repo = (await container()).resolve(SPLIT_REQUEST_REPO);
      const list = await repo.getSplitRequestsForGroup(group.id);
      expect(list.ok && list.value.map(r => r.id)).toEqual([saved.id]);

      const updated = await repo.updateSplitRequest({ ...saved, status: 'paid' });
      expect(updated.ok && updated.value.status).toBe('paid');
    });

    it('a non-member cannot read it', async () => {
      await signInAs(outsider);
      const list = await (await container()).resolve(SPLIT_REQUEST_REPO).getSplitRequestsForGroup(group.id);
      expect(list.ok && list.value).toEqual([]);
    });
  });
});
