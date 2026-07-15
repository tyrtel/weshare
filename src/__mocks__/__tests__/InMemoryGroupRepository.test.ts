import { InMemoryGroupRepository } from '../InMemoryGroupRepository';
import { groupFactory, groupMemberFactory } from '../../__testUtils__/factories';

describe('InMemoryGroupRepository', () => {
  let repo: InMemoryGroupRepository;

  beforeEach(() => {
    repo = new InMemoryGroupRepository();
  });

  describe('saveGroup / getGroup', () => {
    it('saves and retrieves a group by id', async () => {
      const group = groupFactory();
      await repo.saveGroup(group);
      const result = await repo.getGroup(group.id);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toEqual(group);
    });

    it('returns NotFoundError for unknown id', async () => {
      const result = await repo.getGroup('missing');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('NotFoundError');
    });
  });

  describe('getGroupsForUser', () => {
    it('returns groups the user owns', async () => {
      const g1 = groupFactory({ id: 'g1', ownerId: 'u1' });
      const g2 = groupFactory({ id: 'g2', ownerId: 'u2' });
      await repo.saveGroup(g1);
      await repo.saveGroup(g2);
      const result = await repo.getGroupsForUser('u1');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0].id).toBe('g1');
      }
    });

    it('returns groups the user is a member of', async () => {
      const member = groupMemberFactory({ userId: 'u3', groupId: 'g1' });
      const g1 = groupFactory({ id: 'g1', ownerId: 'u1', members: [member] });
      await repo.saveGroup(g1);
      const result = await repo.getGroupsForUser('u3');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toHaveLength(1);
    });

    it('returns empty array when user has no groups', async () => {
      const result = await repo.getGroupsForUser('nobody');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toHaveLength(0);
    });
  });

  describe('getGroupByInviteToken', () => {
    it('finds a group by token', async () => {
      const group = groupFactory({ inviteToken: 'abc123' });
      await repo.saveGroup(group);
      const result = await repo.getGroupByInviteToken('abc123');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.id).toBe(group.id);
    });

    it('returns NotFoundError for unknown token', async () => {
      const result = await repo.getGroupByInviteToken('nope');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('NotFoundError');
    });
  });

  describe('updateGroup', () => {
    it('updates an existing group', async () => {
      const group = groupFactory();
      await repo.saveGroup(group);
      const updated = { ...group, name: 'New Name' };
      const result = await repo.updateGroup(updated);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.name).toBe('New Name');
      const fetched = await repo.getGroup(group.id);
      if (fetched.ok) expect(fetched.value.name).toBe('New Name');
    });

    it('returns NotFoundError when group does not exist', async () => {
      const result = await repo.updateGroup(groupFactory({ id: 'ghost' }));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('NotFoundError');
    });
  });

  describe('deleteGroup', () => {
    it('deletes an existing group', async () => {
      const group = groupFactory();
      await repo.saveGroup(group);
      const del = await repo.deleteGroup(group.id);
      expect(del.ok).toBe(true);
      const fetched = await repo.getGroup(group.id);
      expect(fetched.ok).toBe(false);
    });

    it('returns NotFoundError when group does not exist', async () => {
      const result = await repo.deleteGroup('ghost');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('NotFoundError');
    });
  });

  describe('seed', () => {
    it('pre-populates the repository', async () => {
      const g1 = groupFactory({ id: 'g1', ownerId: 'u1' });
      const g2 = groupFactory({ id: 'g2', ownerId: 'u1' });
      repo.seed([g1, g2]);
      const result = await repo.getGroupsForUser('u1');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toHaveLength(2);
    });
  });

  // ── Guest merge (TODO_userMerge.md Chunk A) ─────────────────────────────────

  describe('findMemberByEmail', () => {
    it('finds a placeholder member by email, case-insensitively', async () => {
      const placeholder = groupMemberFactory({ userId: 'guest_1', groupId: 'g1', email: 'Marie@Example.com' });
      repo.seed([groupFactory({ id: 'g1', ownerId: 'u1', members: [placeholder] })]);

      const result = await repo.findMemberByEmail('g1', 'marie@example.com');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value?.userId).toBe('guest_1');
    });

    it('returns null when no member has that email', async () => {
      repo.seed([groupFactory({ id: 'g1', ownerId: 'u1', members: [] })]);
      const result = await repo.findMemberByEmail('g1', 'nobody@example.com');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBeNull();
    });
  });

  describe('claimGroupMemberSlot', () => {
    it('re-parents the placeholder to the new user and flips isGuest false', async () => {
      const placeholder = groupMemberFactory({ userId: 'guest_1', groupId: 'g1', email: 'marie@example.com', isGuest: true, displayName: 'Marie (placeholder)' });
      repo.seed([groupFactory({ id: 'g1', ownerId: 'u1', members: [placeholder] })]);

      const result = await repo.claimGroupMemberSlot('g1', 'guest_1', 'user_marie', 'Marie');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.userId).toBe('user_marie');
        expect(result.value.isGuest).toBe(false);
        expect(result.value.displayName).toBe('Marie');
      }

      const group = await repo.getGroup('g1');
      if (group.ok) {
        expect(group.value.members).toHaveLength(1);
        expect(group.value.members[0].userId).toBe('user_marie');
      }
    });

    it('returns NotFoundError when the placeholder does not exist', async () => {
      repo.seed([groupFactory({ id: 'g1', ownerId: 'u1', members: [] })]);
      const result = await repo.claimGroupMemberSlot('g1', 'guest_missing', 'user_marie', 'Marie');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('NotFoundError');
    });
  });

  describe('updateMemberEmail', () => {
    it('sets the email on an existing member', async () => {
      const guest = groupMemberFactory({ userId: 'guest_1', groupId: 'g1', displayName: 'Jay', isGuest: true });
      repo.seed([groupFactory({ id: 'g1', ownerId: 'u1', members: [guest] })]);

      const result = await repo.updateMemberEmail('g1', 'guest_1', 'jay@example.com');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.email).toBe('jay@example.com');

      const group = await repo.getGroup('g1');
      if (group.ok) expect(group.value.members[0].email).toBe('jay@example.com');
    });

    it('returns NotFoundError when the member does not exist', async () => {
      repo.seed([groupFactory({ id: 'g1', ownerId: 'u1', members: [] })]);
      const result = await repo.updateMemberEmail('g1', 'guest_missing', 'jay@example.com');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('NotFoundError');
    });
  });
});
