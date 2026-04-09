/**
 * Bills feature integration tests.
 *
 * All storage runs against InMemoryStorageService — no SQLite, no file I/O.
 * Each test gets a fresh container via createTestContainer() in beforeEach,
 * guaranteeing state isolation.
 */
import { createTestContainer } from '../../../core/di/container';
import { InMemoryStorageService } from '../../../__mocks__/InMemoryStorageService';
import type { Bill } from '../../../core/models/Bill';
import type { Participant } from '../../../core/models/Participant';
import type { Split } from '../../../core/models/Split';

describe('Bills feature', () => {
  let storage: InMemoryStorageService;

  beforeEach(() => {
    const container = createTestContainer();
    storage = container.resolve('storageService') as InMemoryStorageService;
  });

  // ── Creating bills ──────────────────────────────────────────────────────────

  describe('creating a bill', () => {
    it('persists a bill and retrieves it by id', async () => {
      const bill: Bill = {
        id: 'bill_001',
        title: 'Team lunch',
        totalAmount: 120.0,
        currency: 'USD',
        createdAt: new Date('2024-03-01T12:00:00Z'),
        participants: [],
        splits: [],
      };

      await storage.saveBill(bill);

      const retrieved = await storage.getBill('bill_001');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.title).toBe('Team lunch');
      expect(retrieved?.totalAmount).toBe(120.0);
      expect(retrieved?.currency).toBe('USD');
    });

    it('returns null for an id that does not exist', async () => {
      const result = await storage.getBill('non_existent_id');
      expect(result).toBeNull();
    });

    it('lists all saved bills', async () => {
      const billA: Bill = {
        id: 'bill_a',
        title: 'Groceries',
        totalAmount: 85.5,
        currency: 'USD',
        createdAt: new Date('2024-03-10'),
        participants: [],
        splits: [],
      };
      const billB: Bill = {
        id: 'bill_b',
        title: 'Cinema',
        totalAmount: 42.0,
        currency: 'USD',
        createdAt: new Date('2024-03-12'),
        participants: [],
        splits: [],
      };

      await storage.saveBill(billA);
      await storage.saveBill(billB);

      const all = await storage.getAllBills();
      expect(all).toHaveLength(2);
      expect(all.map((b) => b.id)).toEqual(expect.arrayContaining(['bill_a', 'bill_b']));
    });

    it('deletes a bill by id', async () => {
      const bill: Bill = {
        id: 'bill_del',
        title: 'Temp',
        totalAmount: 10,
        currency: 'USD',
        createdAt: new Date(),
        participants: [],
        splits: [],
      };
      await storage.saveBill(bill);
      await storage.deleteBill('bill_del');

      const result = await storage.getBill('bill_del');
      expect(result).toBeNull();
    });
  });

  // ── Adding participants ─────────────────────────────────────────────────────

  describe('adding participants to a bill', () => {
    it('saves participants and links them to a bill via updateBill', async () => {
      const bill: Bill = {
        id: 'bill_002',
        title: 'Road trip fuel',
        totalAmount: 200.0,
        currency: 'USD',
        createdAt: new Date(),
        participants: [],
        splits: [],
      };
      const alice: Participant = { id: 'p_alice', name: 'Alice', contactInfo: '@alice_venmo' };
      const bob: Participant = { id: 'p_bob', name: 'Bob', contactInfo: '@bob_venmo' };

      await storage.saveBill(bill);
      await storage.saveParticipant(alice);
      await storage.saveParticipant(bob);
      await storage.updateBill({ ...bill, participants: ['p_alice', 'p_bob'] });

      const updated = await storage.getBill('bill_002');
      expect(updated?.participants).toEqual(['p_alice', 'p_bob']);

      const retrievedAlice = await storage.getParticipant('p_alice');
      expect(retrievedAlice?.name).toBe('Alice');
      expect(retrievedAlice?.contactInfo).toBe('@alice_venmo');
    });

    it('lists all participants', async () => {
      await storage.saveParticipant({ id: 'p1', name: 'Charlie', contactInfo: 'charlie@test.com' });
      await storage.saveParticipant({ id: 'p2', name: 'Diana', contactInfo: 'diana@test.com' });

      const all = await storage.getAllParticipants();
      expect(all).toHaveLength(2);
    });

    it('updates a participant in place', async () => {
      const original: Participant = { id: 'p_upd', name: 'Eve', contactInfo: '@eve_old' };
      await storage.saveParticipant(original);
      await storage.updateParticipant({ ...original, contactInfo: '@eve_new' });

      const retrieved = await storage.getParticipant('p_upd');
      expect(retrieved?.contactInfo).toBe('@eve_new');
    });

    it('removes a participant', async () => {
      await storage.saveParticipant({ id: 'p_rm', name: 'Frank', contactInfo: '' });
      await storage.deleteParticipant('p_rm');

      const result = await storage.getParticipant('p_rm');
      expect(result).toBeNull();
    });
  });

  // ── Calculating splits ──────────────────────────────────────────────────────

  describe('calculating splits', () => {
    it('divides the total equally among all participants and persists each split', async () => {
      const bill: Bill = {
        id: 'bill_003',
        title: 'Birthday dinner',
        totalAmount: 300.0,
        currency: 'USD',
        createdAt: new Date(),
        participants: ['p_x', 'p_y', 'p_z'],
        splits: [],
      };
      await storage.saveBill(bill);

      const perPerson = bill.totalAmount / bill.participants.length; // 100.00
      const splits: Split[] = bill.participants.map((participantId, index) => ({
        id: `split_${index}`,
        billId: bill.id,
        participantId,
        amountOwed: perPerson,
        amountPaid: 0,
        settled: false,
      }));

      for (const split of splits) {
        await storage.saveSplit(split);
      }
      await storage.updateBill({ ...bill, splits: splits.map((s) => s.id) });

      const persisted = await storage.getSplitsForBill('bill_003');
      expect(persisted).toHaveLength(3);

      const total = persisted.reduce((sum, s) => sum + s.amountOwed, 0);
      expect(total).toBeCloseTo(300.0, 2);

      for (const s of persisted) {
        expect(s.amountOwed).toBeCloseTo(100.0, 2);
        expect(s.settled).toBe(false);
        expect(s.amountPaid).toBe(0);
      }
    });

    it('marks a split as settled when payment is confirmed', async () => {
      const split: Split = {
        id: 'split_settle',
        billId: 'bill_x',
        participantId: 'p_a',
        amountOwed: 50.0,
        amountPaid: 0,
        settled: false,
      };
      await storage.saveSplit(split);
      await storage.updateSplit({ ...split, amountPaid: 50.0, settled: true });

      const retrieved = await storage.getSplit('split_settle');
      expect(retrieved?.settled).toBe(true);
      expect(retrieved?.amountPaid).toBe(50.0);
    });

    it('deletes an individual split', async () => {
      const split: Split = {
        id: 'split_del',
        billId: 'bill_y',
        participantId: 'p_b',
        amountOwed: 25.0,
        amountPaid: 0,
        settled: false,
      };
      await storage.saveSplit(split);
      await storage.deleteSplit('split_del');

      const result = await storage.getSplit('split_del');
      expect(result).toBeNull();
    });

    it('only returns splits that belong to the requested bill', async () => {
      const splitA: Split = {
        id: 's_a',
        billId: 'bill_alpha',
        participantId: 'p1',
        amountOwed: 20,
        amountPaid: 0,
        settled: false,
      };
      const splitB: Split = {
        id: 's_b',
        billId: 'bill_beta',
        participantId: 'p1',
        amountOwed: 30,
        amountPaid: 0,
        settled: false,
      };
      await storage.saveSplit(splitA);
      await storage.saveSplit(splitB);

      const result = await storage.getSplitsForBill('bill_alpha');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('s_a');
    });
  });
});
