import * as SQLite from 'expo-sqlite';
import type { IStorageService } from '../../core/interfaces/IStorageService';
import type { Bill } from '../../core/models/Bill';
import type { Participant } from '../../core/models/Participant';
import type { Split } from '../../core/models/Split';

// ── Row shapes returned by SQLite queries ─────────────────────────────────────

interface BillRow {
  id: string;
  title: string;
  totalAmount: number;
  currency: string;
  createdAt: string;
  participantIds: string;
  splitIds: string;
}

interface SplitRow {
  id: string;
  billId: string;
  participantId: string;
  amountOwed: number;
  amountPaid: number;
  settled: number; // SQLite stores booleans as 0/1
}

// ── Implementation ────────────────────────────────────────────────────────────

export class SqliteStorageService implements IStorageService {
  private db: SQLite.SQLiteDatabase;

  constructor() {
    this.db = SQLite.openDatabaseSync('weshare.db');
    this.initSchema();
  }

  private initSchema(): void {
    this.db.execSync(`
      CREATE TABLE IF NOT EXISTS bills (
        id            TEXT PRIMARY KEY,
        title         TEXT    NOT NULL,
        totalAmount   REAL    NOT NULL,
        currency      TEXT    NOT NULL,
        createdAt     TEXT    NOT NULL,
        participantIds TEXT   NOT NULL DEFAULT '[]',
        splitIds       TEXT   NOT NULL DEFAULT '[]'
      );

      CREATE TABLE IF NOT EXISTS participants (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        contactInfo TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS splits (
        id            TEXT PRIMARY KEY,
        billId        TEXT NOT NULL,
        participantId TEXT NOT NULL,
        amountOwed    REAL NOT NULL,
        amountPaid    REAL NOT NULL,
        settled       INTEGER NOT NULL DEFAULT 0
      );
    `);
  }

  // ── Bills ─────────────────────────────────────────────────────────────────

  async saveBill(bill: Bill): Promise<void> {
    this.db.runSync(
      `INSERT INTO bills (id, title, totalAmount, currency, createdAt, participantIds, splitIds)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      bill.id,
      bill.title,
      bill.totalAmount,
      bill.currency,
      bill.createdAt.toISOString(),
      JSON.stringify(bill.participants),
      JSON.stringify(bill.splits),
    );
  }

  async getBill(id: string): Promise<Bill | null> {
    const row = this.db.getFirstSync<BillRow>('SELECT * FROM bills WHERE id = ?', id);
    return row ? this.rowToBill(row) : null;
  }

  async getAllBills(): Promise<Bill[]> {
    const rows = this.db.getAllSync<BillRow>('SELECT * FROM bills ORDER BY createdAt DESC');
    return rows.map(this.rowToBill);
  }

  async updateBill(bill: Bill): Promise<void> {
    this.db.runSync(
      `UPDATE bills
       SET title = ?, totalAmount = ?, currency = ?, createdAt = ?, participantIds = ?, splitIds = ?
       WHERE id = ?`,
      bill.title,
      bill.totalAmount,
      bill.currency,
      bill.createdAt.toISOString(),
      JSON.stringify(bill.participants),
      JSON.stringify(bill.splits),
      bill.id,
    );
  }

  async deleteBill(id: string): Promise<void> {
    this.db.runSync('DELETE FROM bills WHERE id = ?', id);
  }

  private rowToBill(row: BillRow): Bill {
    return {
      id: row.id,
      title: row.title,
      totalAmount: row.totalAmount,
      currency: row.currency,
      createdAt: new Date(row.createdAt),
      participants: JSON.parse(row.participantIds) as string[],
      splits: JSON.parse(row.splitIds) as string[],
    };
  }

  // ── Participants ──────────────────────────────────────────────────────────

  async saveParticipant(participant: Participant): Promise<void> {
    this.db.runSync(
      'INSERT INTO participants (id, name, contactInfo) VALUES (?, ?, ?)',
      participant.id,
      participant.name,
      participant.contactInfo,
    );
  }

  async getParticipant(id: string): Promise<Participant | null> {
    return (
      this.db.getFirstSync<Participant>('SELECT * FROM participants WHERE id = ?', id) ?? null
    );
  }

  async getAllParticipants(): Promise<Participant[]> {
    return this.db.getAllSync<Participant>('SELECT * FROM participants ORDER BY name ASC');
  }

  async updateParticipant(participant: Participant): Promise<void> {
    this.db.runSync(
      'UPDATE participants SET name = ?, contactInfo = ? WHERE id = ?',
      participant.name,
      participant.contactInfo,
      participant.id,
    );
  }

  async deleteParticipant(id: string): Promise<void> {
    this.db.runSync('DELETE FROM participants WHERE id = ?', id);
  }

  // ── Splits ────────────────────────────────────────────────────────────────

  async saveSplit(split: Split): Promise<void> {
    this.db.runSync(
      `INSERT INTO splits (id, billId, participantId, amountOwed, amountPaid, settled)
       VALUES (?, ?, ?, ?, ?, ?)`,
      split.id,
      split.billId,
      split.participantId,
      split.amountOwed,
      split.amountPaid,
      split.settled ? 1 : 0,
    );
  }

  async getSplit(id: string): Promise<Split | null> {
    const row = this.db.getFirstSync<SplitRow>('SELECT * FROM splits WHERE id = ?', id);
    return row ? this.rowToSplit(row) : null;
  }

  async getSplitsForBill(billId: string): Promise<Split[]> {
    const rows = this.db.getAllSync<SplitRow>('SELECT * FROM splits WHERE billId = ?', billId);
    return rows.map(this.rowToSplit);
  }

  async updateSplit(split: Split): Promise<void> {
    this.db.runSync(
      `UPDATE splits
       SET billId = ?, participantId = ?, amountOwed = ?, amountPaid = ?, settled = ?
       WHERE id = ?`,
      split.billId,
      split.participantId,
      split.amountOwed,
      split.amountPaid,
      split.settled ? 1 : 0,
      split.id,
    );
  }

  async deleteSplit(id: string): Promise<void> {
    this.db.runSync('DELETE FROM splits WHERE id = ?', id);
  }

  private rowToSplit(row: SplitRow): Split {
    return { ...row, settled: row.settled === 1 };
  }
}
