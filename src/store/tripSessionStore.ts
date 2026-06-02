import { createStore } from 'zustand/vanilla';
import type { StoreApi } from 'zustand/vanilla';
import type { ITripRepository } from '../core/interfaces/ITripRepository';
import type { TripStatus } from '../core/models/Trip';
import type { IExpenseRepository } from '../core/interfaces/IExpenseRepository';
import type { IMemberRepository } from '../core/interfaces/IMemberRepository';
import type { ISplitRepository } from '../core/interfaces/ISplitRepository';
import type { ISplitRequestRepository } from '../core/interfaces/ISplitRequestRepository';
import type { ITripSessionStore, TripSessionState } from '../core/interfaces/ITripSessionStore';
import type { AppError } from '../core/types/AppError';
import type { Trip } from '../core/models/Trip';
import type { TripMember } from '../core/models/TripMember';
import type { Expense } from '../core/models/Expense';
import type { Split } from '../core/models/Split';
import type { SplitRequest } from '../core/models/SplitRequest';
import { ok, isOk, isErr } from '../core/types/Result';
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

export interface TripStoreRepos {
  trips:         ITripRepository;
  expenses:      IExpenseRepository;
  members:       IMemberRepository;
  splits:        ISplitRepository;
  splitRequests: ISplitRequestRepository;
}

export type TripSessionStoreApi = StoreApi<ITripSessionStore>;

// ---------------------------------------------------------------------------
// Initial state — also used by resetSession to wipe the cache cleanly
// ---------------------------------------------------------------------------

const INITIAL_STATE: TripSessionState = {
  activeTripId: null,
  trips: [],
  expenses: {},
  members: {},
  splitRequests: {},
  pendingExpenseIds: [],
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

export function createTripSessionStore(repos: TripStoreRepos): TripSessionStoreApi {
  return createStore<ITripSessionStore>()((set, get) => ({
    ...INITIAL_STATE,

    // ── Trips ───────────────────────────────────────────────────────────────

    async loadTrips(userId: string): Promise<void> {
      const result = await repos.trips.getTripsForUser(userId);
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
        repos.expenses.getExpensesForTrip(tripId),
        repos.members.getMembersForTrip(tripId),
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
      const members  = parseMany<TripMember>(membersResult.value, tripMemberSchema);

      set((state) => {
        // Merge repo members back into state.trips so TripCard member avatars stay
        // in sync. Repo members are authoritative; any userId already embedded in the
        // Trip row (e.g. the owner, written at creation time) is preserved only if the
        // member repo doesn't also return them (same strategy as useTripDetail).
        const repoUserIds = new Set(members.map(m => m.userId));
        const trips = state.trips.map(t => {
          if (t.id !== tripId) return t;
          const embeddedOnly = t.members.filter(m => !repoUserIds.has(m.userId));
          return { ...t, members: [...embeddedOnly, ...members] };
        });

        return {
          expenses: { ...state.expenses, [tripId]: expenses },
          members:  { ...state.members,  [tripId]: members },
          trips,
          hydrationError: null,
        };
      });
    },

    // ── Expenses ─────────────────────────────────────────────────────────────

    async addExpense(expense: Expense): Promise<void> {
      const currentTrip = get().trips.find(t => t.id === expense.tripId);
      if (currentTrip && currentTrip.status !== 'active') {
        set({ hydrationError: { kind: 'ValidationError', field: 'trip.status', message: 'Expenses cannot be added while the trip is being settled' } });
        return;
      }

      // Optimistic append — expense appears in the UI before the network round-trip.
      set((state) => ({
        expenses: {
          ...state.expenses,
          [expense.tripId]: [...(state.expenses[expense.tripId] ?? []), expense],
        },
        pendingExpenseIds: [...state.pendingExpenseIds, expense.id],
      }));

      const rollback = (error: AppError) => {
        set((state) => ({
          expenses: {
            ...state.expenses,
            [expense.tripId]: (state.expenses[expense.tripId] ?? []).filter(
              (e) => e.id !== expense.id,
            ),
          },
          pendingExpenseIds: state.pendingExpenseIds.filter((id) => id !== expense.id),
          hydrationError: error,
        }));
      };

      const result = await repos.expenses.saveExpense(expense);
      if (isErr(result)) {
        rollback(result.error);
        return;
      }
      const parsed = safeParse(expenseSchema, result.value);
      if (isErr(parsed)) {
        rollback(parsed.error);
        return;
      }
      const saved = parsed.value as Expense;
      // Replace optimistic entry with the confirmed server copy.
      set((state) => ({
        expenses: {
          ...state.expenses,
          [saved.tripId]: (state.expenses[saved.tripId] ?? []).map((e) =>
            e.id === expense.id ? saved : e,
          ),
        },
        pendingExpenseIds: state.pendingExpenseIds.filter((id) => id !== expense.id),
        hydrationError: null,
      }));
    },

    async removeExpense(expenseId: string, tripId: string): Promise<void> {
      const result = await repos.expenses.deleteExpense(expenseId);
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

    async markSettled(split: Split) {
      const settled: Split = {
        ...split,
        amountPaidCents: split.amountOwedCents,
        settledAt: new Date(),
      };
      const result = await repos.splits.updateSplit(settled);
      if (isErr(result)) {
        set({ hydrationError: result.error });
        return result;
      }
      const parsed = safeParse(splitSchema, result.value);
      if (isErr(parsed)) {
        set({ hydrationError: parsed.error });
        return parsed;
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
      return ok(updatedSplit);
    },

    // ── Split requests ────────────────────────────────────────────────────────

    async loadSplitRequests(tripId: string): Promise<void> {
      const result = await repos.splitRequests.getSplitRequestsForTrip(tripId);
      if (isErr(result)) {
        set({ hydrationError: result.error });
        return;
      }
      set((state) => ({
        splitRequests: { ...state.splitRequests, [tripId]: result.value },
        hydrationError: null,
      }));
    },

    async saveSplitRequest(req: SplitRequest): Promise<void> {
      const result = await repos.splitRequests.saveSplitRequest(req);
      if (isErr(result)) {
        set({ hydrationError: result.error });
        return;
      }
      const saved = result.value;
      set((state) => ({
        splitRequests: {
          ...state.splitRequests,
          [req.tripId]: [...(state.splitRequests[req.tripId] ?? []), saved],
        },
        hydrationError: null,
      }));
    },

    async updateSplitRequest(req: SplitRequest): Promise<void> {
      const result = await repos.splitRequests.updateSplitRequest(req);
      if (isErr(result)) {
        set({ hydrationError: result.error });
        return;
      }
      const updated = result.value;
      set((state) => ({
        splitRequests: {
          ...state.splitRequests,
          [req.tripId]: (state.splitRequests[req.tripId] ?? []).map(r =>
            r.id === updated.id ? updated : r,
          ),
        },
        hydrationError: null,
      }));
    },

    // ── Trip status ───────────────────────────────────────────────────────────

    async setTripStatus(tripId: string, status: TripStatus) {
      const result = await repos.trips.setTripStatus(tripId, status);
      if (isErr(result)) {
        set({ hydrationError: result.error });
        return result;
      }
      set((state) => ({
        trips: state.trips.map(t => t.id === tripId ? result.value : t),
      }));
      return result;
    },

    // ── Synchronous cache mutations (no repo call) ────────────────────────────

    appendTrip(trip: Trip): void {
      set((state) => ({ trips: [...state.trips, trip] }));
    },

    replaceTrip(trip: Trip): void {
      set((state) => ({
        trips: state.trips.map(t => (t.id === trip.id ? trip : t)),
      }));
    },

    appendExpense(expense: Expense): void {
      set((state) => ({
        expenses: {
          ...state.expenses,
          [expense.tripId]: [...(state.expenses[expense.tripId] ?? []), expense],
        },
      }));
    },

    replaceExpense(expense: Expense): void {
      set((state) => {
        const updated: Record<string, Expense[]> = {};
        for (const [tid, tripExpenses] of Object.entries(state.expenses)) {
          updated[tid] = tripExpenses.map(e => (e.id === expense.id ? expense : e));
        }
        return { expenses: updated };
      });
    },

    appendSplitRequest(req: SplitRequest): void {
      set((state) => ({
        splitRequests: {
          ...state.splitRequests,
          [req.tripId]: [...(state.splitRequests[req.tripId] ?? []), req],
        },
      }));
    },

    appendMember(member: TripMember): void {
      set((state) => ({
        members: {
          ...state.members,
          [member.tripId]: [...(state.members[member.tripId] ?? []), member],
        },
        // Keep the trips list in sync so TripCard member avatars update immediately.
        trips: state.trips.map(t =>
          t.id === member.tripId
            ? { ...t, members: [...t.members, member] }
            : t
        ),
      }));
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
