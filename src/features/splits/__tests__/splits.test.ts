import { createTestContainer } from '../../../core/di/container';
import { InMemoryStorageService } from '../../../__mocks__/InMemoryStorageService';
import type { Bill } from '../../../core/models/Bill';
import type { Split } from '../../../core/models/Split';

describe('Splits feature', () => {
  let storage: InMemoryStorageService;

  beforeEach(() => {
    const container = createTestContainer();
    storage = container.resolve('storageService') as InMemoryStorageService;
  });

  it('calculates equal splits across three participants', async () => {
    const bill: Bill = {
      id: 'bill_split',
      title: 'Pizza Night',
      totalAmount: 90.0,
      currency: 'USD',
      createdAt: new Date(),
      participants: ['p1', 'p2', 'p3'],
      splits: [],
    };
    await storage.saveBill(bill);

    const perPerson = bill.totalAmount / bill.participants.length;
    const splits: Split[] = bill.participants.map((pid, i) => ({
      id: `s${i}`,
      billId: bill.id,
      participantId: pid,
      amountOwed: perPerson,
      amountPaid: 0,
      settled: false,
    }));
    for (const s of splits) await storage.saveSplit(s);

    const retrieved = await storage.getSplitsForBill('bill_split');
    expect(retrieved).toHaveLength(3);
    retrieved.forEach((s) => expect(s.amountOwed).toBeCloseTo(30.0, 2));
  });

  it('marks a split as settled', async () => {
    const split: Split = {
      id: 'settle_me',
      billId: 'bill_x',
      participantId: 'p1',
      amountOwed: 45.0,
      amountPaid: 0,
      settled: false,
    };
    await storage.saveSplit(split);
    await storage.updateSplit({ ...split, amountPaid: 45.0, settled: true });

    const result = await storage.getSplit('settle_me');
    expect(result?.settled).toBe(true);
    expect(result?.amountPaid).toBe(45.0);
  });
});
