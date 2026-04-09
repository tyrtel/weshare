import type { Bill } from '../models/Bill';
import type { Participant } from '../models/Participant';
import type { Split } from '../models/Split';

export interface IStorageService {
  // ── Bills ────────────────────────────────────────────────────────────────
  saveBill(bill: Bill): Promise<void>;
  getBill(id: string): Promise<Bill | null>;
  getAllBills(): Promise<Bill[]>;
  updateBill(bill: Bill): Promise<void>;
  deleteBill(id: string): Promise<void>;

  // ── Participants ─────────────────────────────────────────────────────────
  saveParticipant(participant: Participant): Promise<void>;
  getParticipant(id: string): Promise<Participant | null>;
  getAllParticipants(): Promise<Participant[]>;
  updateParticipant(participant: Participant): Promise<void>;
  deleteParticipant(id: string): Promise<void>;

  // ── Splits ───────────────────────────────────────────────────────────────
  saveSplit(split: Split): Promise<void>;
  getSplit(id: string): Promise<Split | null>;
  getSplitsForBill(billId: string): Promise<Split[]>;
  updateSplit(split: Split): Promise<void>;
  deleteSplit(id: string): Promise<void>;
}
