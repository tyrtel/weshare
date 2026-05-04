import { createStore } from 'zustand/vanilla';
import type { StoreApi } from 'zustand/vanilla';
import type { IStorageService } from '../core/interfaces/IStorageService';
import type { ITripSessionStore, TripSessionState } from '../core/interfaces/ITripSessionStore';
import type { Trip } from '../core/models/Trip';
import type { TripMember } from '../core/models/TripMember';
import type { Expense } from '../core/models/Expense';
import type { Split } from '../core/models/Split';
import { isOk, isErr } from '../core/types/Result';
import {
  safeParse,
  tripSchema,
  expenseSchema,
  tripMemberSchema,
  splitSchema,
} from '../core/schemas/billSessionSchema';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TripSessionStoreApi = StoreApi<ITripSessionStore>;

// ---------------------------------------------------------------------------
// Initial state — also used by resetSession to wipe the cache cleanly
// ---------------------------------------------------------------------------

const INITIAL_STATE: TripSessionState = {
  activeTripId: null,
  trips: [],
  expenses: {},
  members: {},
  isHydrated: false,
  hydrationError: null,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseMany<T>(
  items: unknown[],
  schema: Parameters<typeof safeParse>[0],
): T[] {
  const out: T[] = [];
  for (const item of items) {
    const r = safeParse(schema as Parameters<typeof safeParse>[0], item);
    if (isOk(r)) out.push(r.value as T);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Factory — the only file that may call createStore
// ---------------------------------------------------------------------------

export function createTripSessionStore(storage: IStorageService): TripSessionStoreApi {
  return createStore<ITripSessionStore>()((set) => ({
    ...INITIAL_STATE,

    // ── Trips ───────────────────────────────────────────────────────────────

    async loadTrips(userId: string): Promise<void> {
      const result = await storage.getTripsForUser(userId);
      if (isErr(result)) {
        set({ hydrationError: result.error, isHydrated: true });
        return;
      }
      // Items that fail Zod are silently dropped — bad data must not block the UI.
      const trips = parseMany<Trip>(result.value, tripSchema);
      set({ trips, isHydrated: true, hydrationError: null });
    },

    // ── Trip detail ─────────────────────────────────────────────────────────

    async loadTripDetail(tripId: string): Promise<void> {
      const [expensesResult, membersResult] = await Promise.all([
        storage.getExpensesForTrip(tripId),
        storage.getMembersForTrip(tripId),
      ]);

      if (isErr(expensesResult)) {
        set({ hydrationError: expensesResult.error });
        return;
      }
      if (isErr(membersResult)) {
        set({ hydrationError: membersResult.error });
        return;
      }

      const expenses = parseMany<Expense>(expensesResult.value, expenseSchema);
      const members = parseMany<TripMember>(membersResult.value, tripMemberSchema);

      set((state) => ({
        expenses: { ...state.expenses, [tripId]: expenses },
        members: { ...state.members, [tripId]: members },
        hydrationError: null,
      }));
    },

    // ── Expenses ─────────────────────────────────────────────────────────────

    async addExpense(expense: Expense): Promise<void> {
      const result = await storage.saveExpense(expense);
      if (isErr(result)) {
        set({ hydrationError: result.error });
        return;
      }
      const parsed = safeParse(expenseSchema, result.value);
      if (isErr(parsed)) {
        set({ hydrationError: parsed.error });
        return;
      }
      const saved = parsed.value as Expense;
      set((state) => ({
        expenses: {
          ...state.expenses,
          [saved.tripId]: [...(state.expenses[saved.tripId] ?? []), saved],
        },
        hydrationError: null,
      }));
    },

    async removeExpense(expenseId: string, tripId: string): Promise<void> {
      const result = await storage.deleteExpense(expenseId);
      if (isErr(result)) {
        set({ hydrationError: result.error });
        return;
      }
      set((state) => ({
        expenses: {
          ...state.expenses,
          [tripId]: (state.expenses[tripId] ?? []).filter((e) => e.id !== expenseId),
        },
        hydrationError: null,
      }));
    },

    // ── Splits / settlement ──────────────────────────────────────────────────

    async markSettled(split: Split): Promise<void> {
      const settled: Split = {
        ...split,
        amountPaidCents: split.amountOwedCents,
        settledAt: new Date(),
      };
      const result = await storage.updateSplit(settled);
      if (isErr(result)) {
        set({ hydrationError: result.error });
        return;
      }
      const parsed = safeParse(splitSchema, result.value);
      if (isErr(parsed)) {
        set({ hydrationError: parsed.error });
        return;
      }
      const updatedSplit = parsed.value as Split;
      set((state) => {
        const updatedExpenses: Record<string, Expense[]> = {};
        for (const [tid, tripExpenses] of Object.entries(state.expenses)) {
          updatedExpenses[tid] = tripExpenses.map((expense) => {
            if (expense.id !== updatedSplit.expenseId) return expense;
            return {
              ...expense,
              splits: expense.splits.map((s) =>
                s.id === updatedSplit.id ? updatedSplit : s,
              ),
            };
          });
        }
        return { expenses: updatedExpenses, hydrationError: null };
      });
    },

    // ── Navigation ───────────────────────────────────────────────────────────

    setActiveTrip(tripId: string | null): void {
      set({ activeTripId: tripId });
    },

    // ── Lifecycle ────────────────────────────────────────────────────────────

    resetSession(): void {
      set(INITIAL_STATE);
    },
  }));
}
