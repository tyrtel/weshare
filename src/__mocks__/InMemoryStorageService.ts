import type { IStorageService } from '../core/interfaces/IStorageService';
import type { Bill } from '../core/models/Bill';
import type { Participant } from '../core/models/Participant';
import type { Split } from '../core/models/Split';

/**
 * Fully in-memory IStorageService implementation.
 * Suitable for unit tests — no native modules, no disk I/O.
 * Each test should create a fresh instance (via createTestContainer) in beforeEach
 * so state never leaks between tests.
 */
export class InMemoryStorageService implements IStorageService {
  private bills = new Map<string, Bill>();
  private participants = new Map<string, Participant>();
  private splits = new Map<string, Split>();

  // ── Bills ─────────────────────────────────────────────────────────────────

  async saveBill(bill: Bill): Promise<void> {
    this.bills.set(bill.id, { ...bill });
  }

  async getBill(id: string): Promise<Bill | null> {
    return this.bills.get(id) ?? null;
  }

  async getAllBills(): Promise<Bill[]> {
    return Array.from(this.bills.values());
  }

  async updateBill(bill: Bill): Promise<void> {
    if (!this.bills.has(bill.id)) {
      throw new Error(`Bill "${bill.id}" not found; cannot update.`);
    }
    this.bills.set(bill.id, { ...bill });
  }

  async deleteBill(id: string): Promise<void> {
    this.bills.delete(id);
  }

  // ── Participants ──────────────────────────────────────────────────────────

  async saveParticipant(participant: Participant): Promise<void> {
    this.participants.set(participant.id, { ...participant });
  }

  async getParticipant(id: string): Promise<Participant | null> {
    return this.participants.get(id) ?? null;
  }

  async getAllParticipants(): Promise<Participant[]> {
    return Array.from(this.participants.values());
  }

  async updateParticipant(participant: Participant): Promise<void> {
    if (!this.participants.has(participant.id)) {
      throw new Error(`Participant "${participant.id}" not found; cannot update.`);
    }
    this.participants.set(participant.id, { ...participant });
  }

  async deleteParticipant(id: string): Promise<void> {
    this.participants.delete(id);
  }

  // ── Splits ────────────────────────────────────────────────────────────────

  async saveSplit(split: Split): Promise<void> {
    this.splits.set(split.id, { ...split });
  }

  async getSplit(id: string): Promise<Split | null> {
    return this.splits.get(id) ?? null;
  }

  async getSplitsForBill(billId: string): Promise<Split[]> {
    return Array.from(this.splits.values()).filter((s) => s.billId === billId);
  }

  async updateSplit(split: Split): Promise<void> {
    if (!this.splits.has(split.id)) {
      throw new Error(`Split "${split.id}" not found; cannot update.`);
    }
    this.splits.set(split.id, { ...split });
  }

  async deleteSplit(id: string): Promise<void> {
    this.splits.delete(id);
  }
}
