import { createStore } from 'zustand/vanilla';
import type { StoreApi } from 'zustand/vanilla';
import type { ITripRepository } from '../core/interfaces/ITripRepository';
import type { TripStatus } from '../core/models/Trip';
import type { IExpenseRepository } from '../core/interfaces/IExpenseRepository';
import type { IMemberRepository } from '../core/interfaces/IMemberRepository';
import type { ISplitRepository } from '../core/interfaces/ISplitRepository';
import type { ISplitRequestRepository } from '../core/interfaces/ISplitRequestRepository';
import type { IGroupRepository } from '../core/interfaces/IGroupRepository';
import type { ITripSessionStore, TripSessionState } from '../core/interfaces/ITripSessionStore';
import type { AppError } from '../core/types/AppError';
import type { Trip } from '../core/models/Trip';
import type { TripMember } from '../core/models/TripMember';
import type { Expense } from '../core/models/Expense';
import type { Split } from '../core/models/Split';
import type { SplitRequest } from '../core/models/SplitRequest';
import type { Group } from '../core/models/Group';
import type { GroupMember } from '../core/models/GroupMember';
import type { RecurringExpense } from '../core/models/RecurringExpense';
import { ok, isOk, isErr } from '../core/types/Result';
import {
  safeParse,
  tripSchema,
  expenseSchema,
  groupSchema,
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
  groups:        IGroupRepository;
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
  groupSplitRequests: {},
  pendingExpenseIds: [],
  isHydrated: false,
  hydrationError: null,
  groups: [],
  groupExpenses: {},
  recurringExpenses: {},
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
  // Expo Router renders the root layout twice, giving two AuthGate instances
  // that both call loadTrips concurrently. Without dedup each gets its own
  // cold-PostgREST connection; they queue behind each other and breach the
  // 15-second timeout. All concurrent callers share one in-flight query.
  let _loadTripsPromise:  Promise<void> | null = null;
  let _loadGroupsPromise: Promise<void> | null = null;

  return createStore<ITripSessionStore>()((set, get) => ({
    ...INITIAL_STATE,

    // ── Trips ───────────────────────────────────────────────────────────────

    async loadTrips(userId: string): Promise<void> {
      if (_loadTripsPromise) return _loadTripsPromise;
      _loadTripsPromise = repos.trips.getTripsForUser(userId)
        .then(result => {
          if (isErr(result)) {
            set({ hydrationError: result.error, isHydrated: true });
            return;
          }
          const trips = parseMany<Trip>(result.value, tripSchema);
          set({ trips, isHydrated: true, hydrationError: null });
        })
        .finally(() => { _loadTripsPromise = null; });
      return _loadTripsPromise;
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
      const tripId = expense.tripId;
      if (!tripId) return; // group expenses use addGroupExpense instead

      const currentTrip = get().trips.find(t => t.id === tripId);
      if (currentTrip && currentTrip.status !== 'active') {
        set({ hydrationError: { kind: 'ValidationError', field: 'trip.status', message: 'Expenses cannot be added while the trip is being settled' } });
        return;
      }

      // Optimistic append — expense appears in the UI before the network round-trip.
      set((state) => ({
        expenses: {
          ...state.expenses,
          [tripId]: [...(state.expenses[tripId] ?? []), expense],
        },
        pendingExpenseIds: [...state.pendingExpenseIds, expense.id],
      }));

      const rollback = (error: AppError) => {
        set((state) => ({
          expenses: {
            ...state.expenses,
            [tripId]: (state.expenses[tripId] ?? []).filter(
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
      const savedTripId = saved.tripId ?? tripId;
      // Replace optimistic entry with the confirmed server copy.
      set((state) => ({
        expenses: {
          ...state.expenses,
          [savedTripId]: (state.expenses[savedTripId] ?? []).map((e) =>
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

    async loadSplitRequestsForGroup(groupId: string): Promise<void> {
      const result = await repos.splitRequests.getSplitRequestsForGroup(groupId);
      if (isErr(result)) {
        set({ hydrationError: result.error });
        return;
      }
      set((state) => ({
        groupSplitRequests: { ...state.groupSplitRequests, [groupId]: result.value },
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
      if (saved.groupId) {
        set((state) => ({
          groupSplitRequests: {
            ...state.groupSplitRequests,
            [saved.groupId!]: [...(state.groupSplitRequests[saved.groupId!] ?? []), saved],
          },
          hydrationError: null,
        }));
        return;
      }
      set((state) => ({
        splitRequests: {
          ...state.splitRequests,
          [saved.tripId!]: [...(state.splitRequests[saved.tripId!] ?? []), saved],
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
      if (updated.groupId) {
        set((state) => ({
          groupSplitRequests: {
            ...state.groupSplitRequests,
            [updated.groupId!]: (state.groupSplitRequests[updated.groupId!] ?? []).map(r =>
              r.id === updated.id ? updated : r,
            ),
          },
          hydrationError: null,
        }));
        return;
      }
      set((state) => ({
        splitRequests: {
          ...state.splitRequests,
          [updated.tripId!]: (state.splitRequests[updated.tripId!] ?? []).map(r =>
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
      if (!expense.tripId) return; // group expenses are not in the trip expenses slice
      set((state) => ({
        expenses: {
          ...state.expenses,
          [expense.tripId!]: [...(state.expenses[expense.tripId!] ?? []), expense],
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
      if (req.groupId) {
        set((state) => ({
          groupSplitRequests: {
            ...state.groupSplitRequests,
            [req.groupId!]: [...(state.groupSplitRequests[req.groupId!] ?? []), req],
          },
        }));
        return;
      }
      set((state) => ({
        splitRequests: {
          ...state.splitRequests,
          [req.tripId!]: [...(state.splitRequests[req.tripId!] ?? []), req],
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

    // ── Groups ───────────────────────────────────────────────────────────────

    async loadGroups(userId: string): Promise<void> {
      if (_loadGroupsPromise) return _loadGroupsPromise;
      _loadGroupsPromise = repos.groups.getGroupsForUser(userId)
        .then(result => {
          if (isErr(result)) {
            set({ hydrationError: result.error });
            return;
          }
          const groups = parseMany<Group>(result.value, groupSchema);
          set({ groups });
        })
        .finally(() => { _loadGroupsPromise = null; });
      return _loadGroupsPromise;
    },

    async loadGroupDetail(groupId: string): Promise<void> {
      const result = await repos.expenses.getExpensesForGroup(groupId);
      if (isErr(result)) {
        set({ hydrationError: result.error });
        return;
      }
      const expenses = parseMany<Expense>(result.value, expenseSchema);
      set((state) => ({
        groupExpenses: { ...state.groupExpenses, [groupId]: expenses },
        hydrationError: null,
      }));
    },

    async addGroupExpense(expense: Expense): Promise<void> {
      const groupId = expense.groupId;
      if (!groupId) return;

      set((state) => ({
        groupExpenses: {
          ...state.groupExpenses,
          [groupId]: [...(state.groupExpenses[groupId] ?? []), expense],
        },
        pendingExpenseIds: [...state.pendingExpenseIds, expense.id],
      }));

      const rollback = (error: AppError) => {
        set((state) => ({
          groupExpenses: {
            ...state.groupExpenses,
            [groupId]: (state.groupExpenses[groupId] ?? []).filter(e => e.id !== expense.id),
          },
          pendingExpenseIds: state.pendingExpenseIds.filter(id => id !== expense.id),
          hydrationError: error,
        }));
      };

      const result = await repos.expenses.saveExpense(expense);
      if (isErr(result)) { rollback(result.error); return; }
      const parsed = safeParse(expenseSchema, result.value);
      if (isErr(parsed)) { rollback(parsed.error); return; }
      const saved = parsed.value as Expense;
      const savedGroupId = saved.groupId ?? groupId;
      set((state) => ({
        groupExpenses: {
          ...state.groupExpenses,
          [savedGroupId]: (state.groupExpenses[savedGroupId] ?? []).map(e =>
            e.id === expense.id ? saved : e,
          ),
        },
        pendingExpenseIds: state.pendingExpenseIds.filter(id => id !== expense.id),
        hydrationError: null,
      }));
    },

    settleGroupExpenseInStore(expenseId: string, groupId: string, settledAt: Date): void {
      set((state) => ({
        groupExpenses: {
          ...state.groupExpenses,
          [groupId]: (state.groupExpenses[groupId] ?? []).map(e =>
            e.id === expenseId ? { ...e, settledAt } : e,
          ),
        },
      }));
    },

    appendGroupExpense(expense: Expense): void {
      const groupId = expense.groupId;
      if (!groupId) return;
      set((state) => ({
        groupExpenses: {
          ...state.groupExpenses,
          [groupId]: [...(state.groupExpenses[groupId] ?? []), expense],
        },
      }));
    },

    replaceGroupExpense(expense: Expense): void {
      set((state) => {
        const updated: Record<string, Expense[]> = {};
        for (const [gid, groupExpenses] of Object.entries(state.groupExpenses)) {
          updated[gid] = groupExpenses.map(e => (e.id === expense.id ? expense : e));
        }
        return { groupExpenses: updated };
      });
    },

    appendGroup(group: Group): void {
      set((state) => ({ groups: [...state.groups, group] }));
    },

    updateGroupInStore(group: Group): void {
      set((state) => ({
        groups: state.groups.map(g => g.id === group.id ? group : g),
      }));
    },

    removeGroup(groupId: string): void {
      set((state) => ({
        groups: state.groups.filter(g => g.id !== groupId),
        groupExpenses: Object.fromEntries(
          Object.entries(state.groupExpenses).filter(([id]) => id !== groupId),
        ),
      }));
    },

    addMemberToGroupInStore(groupId: string, member: GroupMember): void {
      set((state) => ({
        groups: state.groups.map(g =>
          g.id === groupId ? { ...g, members: [...g.members, member] } : g,
        ),
      }));
    },

    updateGroupMemberInStore(groupId: string, member: GroupMember): void {
      set((state) => ({
        groups: state.groups.map(g =>
          g.id === groupId
            ? { ...g, members: g.members.map(m => m.userId === member.userId ? member : m) }
            : g,
        ),
      }));
    },

    // ── Recurring expenses ───────────────────────────────────────────────────

    setRecurringExpensesForGroup(groupId: string, items: RecurringExpense[]): void {
      set((state) => ({
        recurringExpenses: { ...state.recurringExpenses, [groupId]: items },
      }));
    },

    appendRecurringExpense(re: RecurringExpense): void {
      set((state) => ({
        recurringExpenses: {
          ...state.recurringExpenses,
          [re.groupId]: [...(state.recurringExpenses[re.groupId] ?? []), re],
        },
      }));
    },

    removeRecurringExpense(id: string): void {
      set((state) => {
        const updated: Record<string, RecurringExpense[]> = {};
        for (const [gid, items] of Object.entries(state.recurringExpenses)) {
          updated[gid] = items.filter(r => r.id !== id);
        }
        return { recurringExpenses: updated };
      });
    },

    updateRecurringExpenseInStore(re: RecurringExpense): void {
      set((state) => ({
        recurringExpenses: {
          ...state.recurringExpenses,
          [re.groupId]: (state.recurringExpenses[re.groupId] ?? []).map(r =>
            r.id === re.id ? re : r,
          ),
        },
      }));
    },

    // ── Lifecycle ────────────────────────────────────────────────────────────

    resetSession(): void {
      set(INITIAL_STATE);
    },
  }));
}
