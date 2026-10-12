import { createStore } from 'zustand/vanilla';
import type { StoreApi } from 'zustand/vanilla';
import type { ITripRepository } from '../core/interfaces/ITripRepository';
import type { TripStatus } from '../core/models/Trip';
import type { IExpenseRepository } from '../core/interfaces/IExpenseRepository';
import type { IMemberRepository } from '../core/interfaces/IMemberRepository';
import type { ISplitRepository } from '../core/interfaces/ISplitRepository';
import type { ISplitRequestRepository } from '../core/interfaces/ISplitRequestRepository';
import type { IGroupRepository } from '../core/interfaces/IGroupRepository';
import type { IAuthService } from '../core/interfaces/IAuthService';
import type { IActivityLogRepository } from '../core/interfaces/IActivityLogRepository';
import type { IRecurringExpenseRepository } from '../core/interfaces/IRecurringExpenseRepository';
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
import { ok, err, isOk, isErr } from '../core/types/Result';
import type { Result } from '../core/types/Result';
import {
  safeParse,
  tripSchema,
  expenseSchema,
  groupSchema,
  tripMemberSchema,
  splitSchema,
} from '../core/schemas/billSessionSchema';
import { newActivityEvent } from '../core/utils/activityEvents';
import { freshness, parseBucket, bucket, type CacheBucket } from '../core/logic/cacheFreshness';

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
  auth:          IAuthService;
  activityLog:   IActivityLogRepository;
  recurringExpenses: IRecurringExpenseRepository;
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
  fetchedAt: {},
  writeError: null,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function parseMany<T>(
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

// Repo members are authoritative; any userId already embedded in the Trip row
// (e.g. the owner, written at creation time) is kept only if the member repo
// doesn't also return them (same strategy as useTripDetail).
function withMembers(trip: Trip, members: TripMember[]): Trip {
  const repoUserIds = new Set(members.map(m => m.userId));
  const embeddedOnly = trip.members.filter(m => !repoUserIds.has(m.userId));
  return { ...trip, members: [...embeddedOnly, ...members] };
}

function stamp(fetchedAt: Record<string, number>, ...buckets: CacheBucket[]): Record<string, number> {
  const now = Date.now();
  const next = { ...fetchedAt };
  for (const b of buckets) next[b] = now;
  return next;
}

function loadBucket(s: ITripSessionStore, auth: IAuthService, b: CacheBucket): Promise<void> {
  const { kind, id } = parseBucket(b);
  const user = auth.currentUser();
  switch (kind) {
    case 'trips':         return user ? s.loadTrips(user.id) : Promise.resolve();
    case 'groups':        return user ? s.loadGroups(user.id) : Promise.resolve();
    case 'trip':          return s.loadTripDetail(id);
    case 'group':         return s.loadGroupDetail(id);
    case 'tripRequests':  return s.loadSplitRequests(id);
    case 'groupRequests': return s.loadSplitRequestsForGroup(id);
    case 'recurring':     return s.loadRecurringExpenses(id);
    default:              return Promise.resolve();
  }
}

const REMOTE_REFETCH_DEBOUNCE_MS = 500;

function expenseBucket(e: Expense): CacheBucket {
  return e.groupId ? bucket.group(e.groupId) : bucket.trip(e.tripId!);
}

function withRequests(
  s: TripSessionState,
  scope: SplitRequest,
  fn: (list: SplitRequest[]) => SplitRequest[],
): Partial<TripSessionState> {
  if (scope.groupId) {
    return { groupSplitRequests: { ...s.groupSplitRequests, [scope.groupId]: fn(s.groupSplitRequests[scope.groupId] ?? []) } };
  }
  return { splitRequests: { ...s.splitRequests, [scope.tripId!]: fn(s.splitRequests[scope.tripId!] ?? []) } };
}

/**
 * Save-first write: apply the change to the cache, then persist it. If the
 * server refuses (or the request throws), undo the change, surface it via
 * writeError, and refetch the buckets — some writes are several requests and
 * may have landed part-way, so only the server knows the true state.
 */
interface WriteTracker {
  begin(buckets: CacheBucket[]): void;
  end(buckets: CacheBucket[]): void;
}

async function saveFirst<T>(
  store: Pick<TripSessionStoreApi, 'setState' | 'getState'>,
  writes: WriteTracker,
  apply: () => void,
  revert: () => void,
  persist: () => Promise<Result<T, AppError>>,
  buckets: CacheBucket[],
): Promise<Result<T, AppError>> {
  apply();
  writes.begin(buckets);
  let result: Result<T, AppError>;
  try {
    result = await persist();
  } catch (e) {
    result = err({ kind: 'NetworkError', message: e instanceof Error ? e.message : 'Unexpected error' });
  }
  if (isErr(result)) {
    revert();
    store.setState({ writeError: result.error });
    for (const b of buckets) void store.getState().revalidate(b, { force: true });
  }
  writes.end(buckets);
  return result;
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
  const _revalidating = new Map<CacheBucket, Promise<void>>();

  // Remote changes refetch their bucket after a short debounce, so a burst of
  // edits costs one request — and wait while one of this device's own
  // save-first writes to that bucket is in flight, since a refetch mid-write
  // (e.g. between an expense update and its new splits) would read it half-done.
  const writesInFlight     = new Map<CacheBucket, number>();
  const changedDuringWrite = new Set<CacheBucket>();
  const refetchTimers      = new Map<CacheBucket, ReturnType<typeof setTimeout>>();

  const scheduleRefetch = (b: CacheBucket) => {
    clearTimeout(refetchTimers.get(b));
    refetchTimers.set(b, setTimeout(() => {
      refetchTimers.delete(b);
      void store.getState().revalidate(b, { force: true });
    }, REMOTE_REFETCH_DEBOUNCE_MS));
  };

  const writes: WriteTracker = {
    begin: (buckets) => {
      for (const b of buckets) writesInFlight.set(b, (writesInFlight.get(b) ?? 0) + 1);
    },
    end: (buckets) => {
      for (const b of buckets) {
        const left = (writesInFlight.get(b) ?? 1) - 1;
        if (left > 0) { writesInFlight.set(b, left); continue; }
        writesInFlight.delete(b);
        if (changedDuringWrite.delete(b)) scheduleRefetch(b);
      }
    },
  };

  const store = createStore<ITripSessionStore>()((set, get, api) => ({
    ...INITIAL_STATE,

    notifyRemoteChange(b: CacheBucket): void {
      // A bucket this device never loaded has nothing to refresh.
      if (get().fetchedAt[b] === undefined) return;
      if (writesInFlight.has(b)) { changedDuringWrite.add(b); return; }
      scheduleRefetch(b);
    },

    clearWriteError(): void {
      set({ writeError: null });
    },

    // ── Cache freshness ─────────────────────────────────────────────────────

    revalidate(b: CacheBucket, opts?: { force?: boolean }): Promise<void> {
      if (!opts?.force && freshness(get().fetchedAt[b], Date.now()) === 'fresh') {
        return Promise.resolve();
      }
      const inFlight = _revalidating.get(b);
      if (inFlight) return inFlight;
      const p = loadBucket(get(), repos.auth, b).finally(() => { _revalidating.delete(b); });
      _revalidating.set(b, p);
      return p;
    },

    invalidate(b: CacheBucket): void {
      set((state) => {
        const fetchedAt = { ...state.fetchedAt };
        delete fetchedAt[b];
        return { fetchedAt };
      });
    },

    // ── Trips ───────────────────────────────────────────────────────────────

    async loadTrips(userId: string): Promise<void> {
      if (_loadTripsPromise) return _loadTripsPromise;
      _loadTripsPromise = repos.trips.getTripsForUser(userId)
        .then(async result => {
          if (isErr(result)) {
            set({ hydrationError: result.error, isHydrated: true });
            return;
          }
          const trips = parseMany<Trip>(result.value, tripSchema);
          const ids   = trips.map(t => t.id);

          // Every trip card needs its expenses and members, so fetch them for
          // all trips in two batched queries rather than two per trip.
          const [expensesResult, membersResult] = await Promise.all([
            repos.expenses.getExpensesForTrips(ids),
            repos.members.getMembersForTrips(ids),
          ]);
          // The list itself is good either way; on a detail failure the trip
          // buckets stay unstamped so screens fall back to fetching each trip.
          const listOnly = (error: AppError) => set((state) => ({
            trips, isHydrated: true, hydrationError: error, fetchedAt: stamp(state.fetchedAt, 'trips'),
          }));
          if (isErr(expensesResult)) { listOnly(expensesResult.error); return; }
          if (isErr(membersResult))  { listOnly(membersResult.error);  return; }

          const expenses: Record<string, Expense[]>    = {};
          const members:  Record<string, TripMember[]> = {};
          for (const id of ids) {
            expenses[id] = parseMany<Expense>(expensesResult.value[id], expenseSchema);
            members[id]  = parseMany<TripMember>(membersResult.value[id], tripMemberSchema);
          }
          set((state) => ({
            trips: trips.map(t => withMembers(t, members[t.id])),
            expenses: { ...state.expenses, ...expenses },
            members:  { ...state.members,  ...members },
            isHydrated: true,
            hydrationError: null,
            fetchedAt: stamp(state.fetchedAt, 'trips', ...ids.map(bucket.trip)),
          }));
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

      // Merge repo members back into state.trips so TripCard member avatars stay in sync.
      set((state) => ({
        expenses: { ...state.expenses, [tripId]: expenses },
        members:  { ...state.members,  [tripId]: members },
        trips: state.trips.map(t => (t.id === tripId ? withMembers(t, members) : t)),
        hydrationError: null,
        fetchedAt: stamp(state.fetchedAt, bucket.trip(tripId)),
      }));
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

    async removeExpense(expenseId: string, tripId: string): Promise<boolean> {
      const deleted = get().expenses[tripId]?.find((e) => e.id === expenseId);
      const result = await saveFirst(
        api,
        writes,
        () => set((state) => ({
          expenses: { ...state.expenses, [tripId]: (state.expenses[tripId] ?? []).filter((e) => e.id !== expenseId) },
        })),
        () => {
          if (!deleted) return;
          set((state) => ({ expenses: { ...state.expenses, [tripId]: [...(state.expenses[tripId] ?? []), deleted] } }));
        },
        () => repos.expenses.deleteExpense(expenseId),
        [bucket.trip(tripId)],
      );
      if (isErr(result)) return false;

      // Fire-and-forget: activity feed logging must never block or fail
      // expense deletion.
      repos.activityLog.appendEvent(newActivityEvent({
        eventType:   'expense.deleted',
        entityType:  'expense',
        entityId:    expenseId,
        tripId,
        expenseId,
        actorUserId: repos.auth.currentUser()?.id ?? '',
        payload: deleted ? { description: deleted.description } : null,
      })).catch(() => {});

      return true;
    },

    async editExpense(existing: Expense, updated: Expense): Promise<boolean> {
      const result = await saveFirst(
        api,
        writes,
        () => get().replaceExpense(updated),
        () => get().replaceExpense(existing),
        async (): Promise<Result<Split[], AppError>> => {
          const expResult = await repos.expenses.updateExpense(updated);
          if (isErr(expResult)) return expResult;

          // Delete old splits, then save new ones.
          const oldSplits = await repos.splits.getSplitsForExpense(existing.id);
          if (isOk(oldSplits)) {
            await Promise.all(oldSplits.value.map(sp => repos.splits.deleteSplit(sp.id)));
          }
          const saved: Split[] = [];
          for (const r of await Promise.all(updated.splits.map(sp => repos.splits.saveSplit(sp)))) {
            if (isErr(r)) return r;
            saved.push(r.value);
          }
          return ok(saved);
        },
        [expenseBucket(updated)],
      );
      if (isErr(result)) return false;

      // `updated` (not the server echo) stays the base so the new paidByUserId
      // and metadata hold regardless of what the DB returns.
      get().replaceExpense({ ...updated, splits: result.value });

      // Fire-and-forget: see removeExpense's identical guard.
      repos.activityLog.appendEvent(newActivityEvent({
        eventType:   'expense.updated',
        entityType:  'expense',
        entityId:    updated.id,
        groupId:     updated.groupId,
        tripId:      updated.tripId,
        expenseId:   updated.id,
        actorUserId: repos.auth.currentUser()?.id ?? '',
        payload: {
          description:      updated.description,
          totalAmountCents: updated.totalAmountCents,
          currency:         updated.currency,
        },
      })).catch(() => {});

      return true;
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
        fetchedAt: stamp(state.fetchedAt, bucket.tripRequests(tripId)),
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
        fetchedAt: stamp(state.fetchedAt, bucket.groupRequests(groupId)),
      }));
    },

    async saveSplitRequest(req: SplitRequest): Promise<boolean> {
      const result = await saveFirst(
        api,
        writes,
        () => set((state) => withRequests(state, req, list => [...list, req])),
        () => set((state) => withRequests(state, req, list => list.filter(r => r.id !== req.id))),
        () => repos.splitRequests.saveSplitRequest(req),
        [req.groupId ? bucket.groupRequests(req.groupId) : bucket.tripRequests(req.tripId!)],
      );
      if (isErr(result)) return false;
      set((state) => withRequests(state, req, list => list.map(r => (r.id === req.id ? result.value : r))));
      return true;
    },

    async updateSplitRequest(req: SplitRequest): Promise<boolean> {
      const s0 = get();
      const previous = (req.groupId ? s0.groupSplitRequests[req.groupId] : s0.splitRequests[req.tripId!])
        ?.find(r => r.id === req.id);
      const replaceWith = (next: SplitRequest) =>
        set((state) => withRequests(state, req, list => list.map(r => (r.id === req.id ? next : r))));

      const result = await saveFirst(
        api,
        writes,
        () => replaceWith(req),
        () => { if (previous) replaceWith(previous); },
        () => repos.splitRequests.updateSplitRequest(req),
        [req.groupId ? bucket.groupRequests(req.groupId) : bucket.tripRequests(req.tripId!)],
      );
      if (isErr(result)) return false;
      replaceWith(result.value);
      return true;
    },

    // ── Trip status ───────────────────────────────────────────────────────────

    async setTripStatus(tripId: string, status: TripStatus) {
      const previous = get().trips.find(t => t.id === tripId);
      const result = await saveFirst(
        api,
        writes,
        () => set((state) => ({
          trips: state.trips.map(t => (t.id === tripId
            ? { ...t, status, closedAt: status === 'closed' ? new Date() : t.closedAt }
            : t)),
        })),
        () => { if (previous) get().replaceTrip(previous); },
        () => repos.trips.setTripStatus(tripId, status),
        ['trips'],
      );
      if (isOk(result)) get().replaceTrip(result.value);
      return result;
    },

    async editTrip(existing: Trip, updated: Trip): Promise<boolean> {
      // A currency change carries over to the trip's expenses still in the old one.
      const before   = get().expenses[existing.id] ?? [];
      const carried  = updated.currency === existing.currency
        ? []
        : before.filter(e => e.currency === existing.currency).map(e => ({ ...e, currency: updated.currency }));
      const carriedIds = new Set(carried.map(e => e.id));

      const result = await saveFirst(
        api,
        writes,
        () => set((state) => ({
          trips: state.trips.map(t => (t.id === existing.id ? updated : t)),
          expenses: {
            ...state.expenses,
            [existing.id]: (state.expenses[existing.id] ?? []).map(e => (carriedIds.has(e.id) ? { ...e, currency: updated.currency } : e)),
          },
        })),
        () => set((state) => ({
          trips: state.trips.map(t => (t.id === existing.id ? existing : t)),
          expenses: { ...state.expenses, [existing.id]: before },
        })),
        async (): Promise<Result<Trip, AppError>> => {
          const tripResult = await repos.trips.updateTrip(updated);
          if (isErr(tripResult)) return tripResult;
          for (const r of await Promise.all(carried.map(e => repos.expenses.updateExpense(e)))) {
            if (isErr(r)) return r;
          }
          return tripResult;
        },
        ['trips', bucket.trip(existing.id)],
      );
      if (isErr(result)) return false;
      get().replaceTrip(result.value);
      return true;
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

    removeTrip(tripId: string): void {
      set((state) => ({
        trips: state.trips.filter(t => t.id !== tripId),
        expenses: Object.fromEntries(
          Object.entries(state.expenses).filter(([id]) => id !== tripId),
        ),
        members: Object.fromEntries(
          Object.entries(state.members).filter(([id]) => id !== tripId),
        ),
        splitRequests: Object.fromEntries(
          Object.entries(state.splitRequests).filter(([id]) => id !== tripId),
        ),
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
      if (expense.groupId) {
        const groupId = expense.groupId;
        set((state) => ({
          groupExpenses: {
            ...state.groupExpenses,
            [groupId]: (state.groupExpenses[groupId] ?? []).map(e => (e.id === expense.id ? expense : e)),
          },
        }));
        return;
      }
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
          set((state) => ({ groups, fetchedAt: stamp(state.fetchedAt, 'groups') }));
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
        fetchedAt: stamp(state.fetchedAt, bucket.group(groupId)),
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

    async removeGroupExpense(expenseId: string, groupId: string): Promise<boolean> {
      const deleted = get().groupExpenses[groupId]?.find((e) => e.id === expenseId);
      const result = await saveFirst(
        api,
        writes,
        () => set((state) => ({
          groupExpenses: { ...state.groupExpenses, [groupId]: (state.groupExpenses[groupId] ?? []).filter((e) => e.id !== expenseId) },
        })),
        () => {
          if (!deleted) return;
          set((state) => ({ groupExpenses: { ...state.groupExpenses, [groupId]: [...(state.groupExpenses[groupId] ?? []), deleted] } }));
        },
        () => repos.expenses.deleteExpense(expenseId),
        [bucket.group(groupId)],
      );
      if (isErr(result)) return false;

      // Fire-and-forget: see removeExpense's identical guard.
      repos.activityLog.appendEvent(newActivityEvent({
        eventType:   'expense.deleted',
        entityType:  'expense',
        entityId:    expenseId,
        groupId,
        expenseId,
        actorUserId: repos.auth.currentUser()?.id ?? '',
        payload: deleted ? { description: deleted.description } : null,
      })).catch(() => {});

      return true;
    },

    async settleGroupExpense(expenseId: string, groupId: string, settledAt: Date | null): Promise<boolean> {
      const previous = get().groupExpenses[groupId]?.find(e => e.id === expenseId)?.settledAt ?? null;
      const result = await saveFirst(
        api,
        writes,
        () => get().settleGroupExpenseInStore(expenseId, groupId, settledAt),
        () => get().settleGroupExpenseInStore(expenseId, groupId, previous),
        () => repos.expenses.settleExpense(expenseId, settledAt),
        [bucket.group(groupId)],
      );
      return isOk(result);
    },

    async editGroup(existing: Group, updated: Group): Promise<boolean> {
      // A currency change carries over to the group's expenses still in the old one.
      const before   = get().groupExpenses[existing.id] ?? [];
      const carried  = updated.currency === existing.currency
        ? []
        : before.filter(e => e.currency === existing.currency).map(e => ({ ...e, currency: updated.currency }));
      const carriedIds = new Set(carried.map(e => e.id));

      const result = await saveFirst(
        api,
        writes,
        () => set((state) => ({
          groups: state.groups.map(g => (g.id === existing.id ? updated : g)),
          groupExpenses: {
            ...state.groupExpenses,
            [existing.id]: (state.groupExpenses[existing.id] ?? []).map(e => (carriedIds.has(e.id) ? { ...e, currency: updated.currency } : e)),
          },
        })),
        () => set((state) => ({
          groups: state.groups.map(g => (g.id === existing.id ? existing : g)),
          groupExpenses: { ...state.groupExpenses, [existing.id]: before },
        })),
        async (): Promise<Result<Group, AppError>> => {
          const groupResult = await repos.groups.updateGroup(updated);
          if (isErr(groupResult)) return groupResult;
          for (const r of await Promise.all(carried.map(e => repos.expenses.updateExpense(e)))) {
            if (isErr(r)) return r;
          }
          return groupResult;
        },
        ['groups', bucket.group(existing.id)],
      );
      if (isErr(result)) return false;
      get().updateGroupInStore(result.value);
      return true;
    },

    settleGroupExpenseInStore(expenseId: string, groupId: string, settledAt: Date | null): void {
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

    async loadRecurringExpenses(groupId: string): Promise<void> {
      const result = await repos.recurringExpenses.getRecurringExpensesForGroup(groupId);
      if (isErr(result)) {
        set({ hydrationError: result.error });
        return;
      }
      set((state) => ({
        recurringExpenses: { ...state.recurringExpenses, [groupId]: result.value },
        fetchedAt: stamp(state.fetchedAt, bucket.recurring(groupId)),
      }));
    },

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
      for (const t of refetchTimers.values()) clearTimeout(t);
      refetchTimers.clear();
      changedDuringWrite.clear();
      set(INITIAL_STATE);
    },
  }));
  return store;
}
