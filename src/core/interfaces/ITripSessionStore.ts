import type { Trip, TripStatus } from '../models/Trip';
import type { TripMember } from '../models/TripMember';
import type { Expense } from '../models/Expense';
import type { Split } from '../models/Split';
import type { SplitRequest } from '../models/SplitRequest';
import type { Group } from '../models/Group';
import type { GroupMember } from '../models/GroupMember';
import type { RecurringExpense } from '../models/RecurringExpense';
import type { Result } from '../types/Result';
import type { AppError } from '../types/AppError';
import type { CacheBucket } from '../logic/cacheFreshness';

export interface TripSessionState {
  activeTripId: string | null;
  trips: Trip[];
  expenses: Record<string, Expense[]>;        // keyed by tripId
  members: Record<string, TripMember[]>;      // keyed by tripId
  splitRequests: Record<string, SplitRequest[]>; // keyed by tripId
  groupSplitRequests: Record<string, SplitRequest[]>; // keyed by groupId
  /** IDs of expenses that have been appended optimistically but not yet confirmed by storage. */
  pendingExpenseIds: string[];
  isHydrated: boolean;
  hydrationError: AppError | null;
  groups: Group[];
  groupExpenses: Record<string, Expense[]>;          // keyed by groupId
  recurringExpenses: Record<string, RecurringExpense[]>; // keyed by groupId
  /** Epoch ms of the last successful server fetch per CacheBucket. */
  fetchedAt: Record<string, number>;
  /** Set when a save-first write fails and has been undone; shown app-wide. */
  writeError: AppError | null;
}

export interface TripSessionActions {
  /** Load a bucket from the server unless it is fresh (or always, with force).
   *  Concurrent calls for the same bucket share one request. */
  revalidate(bucket: CacheBucket, opts?: { force?: boolean }): Promise<void>;
  /** Forget a bucket's fetch time so the next revalidate goes to the server. */
  invalidate(bucket: CacheBucket): void;
  /** Fetch and cache recurring expenses for one group. */
  loadRecurringExpenses(groupId: string): Promise<void>;
  clearWriteError(): void;
  /** Another device (or this one) changed rows in this bucket on the server. */
  notifyRemoteChange(bucket: CacheBucket): void;

  // Save-first writes: the cache changes immediately and the returned promise
  // resolves once the server has answered. On failure the change is undone,
  // writeError is set, and the affected bucket is refetched (several of these
  // are multi-step writes that can fail part-way).

  /** Replace an expense (and its splits) — trip or group. */
  editExpense(existing: Expense, updated: Expense): Promise<boolean>;
  /** Close (settledAt set) or reopen (null) a group expense. */
  settleGroupExpense(expenseId: string, groupId: string, settledAt: Date | null): Promise<boolean>;
  /** Rename / change currency; a currency change carries over to expenses in the old currency. */
  editTrip(existing: Trip, updated: Trip): Promise<boolean>;
  editGroup(existing: Group, updated: Group): Promise<boolean>;

  /** Fetch all trips for a user and populate the cache. Sets isHydrated on completion. */
  loadTrips(userId: string): Promise<void>;
  /** Fetch and cache expenses + members for one trip. */
  loadTripDetail(tripId: string): Promise<void>;
  /** Fetch and cache split requests for one trip. */
  loadSplitRequests(tripId: string): Promise<void>;
  /** Fetch and cache split requests for one group. */
  loadSplitRequestsForGroup(groupId: string): Promise<void>;

  /** Persist a new expense and append it to the cache (with optimistic write). */
  addExpense(expense: Expense): Promise<void>;
  /** Save-first delete of a trip expense. Resolves false (never rejects) if the server refused. */
  removeExpense(expenseId: string, tripId: string): Promise<boolean>;
  /** Mark a split as fully paid, persist it, and update the nested split in the cache. */
  markSettled(split: Split): Promise<Result<Split, AppError>>;
  /** Save-first create of a split request — trip- or group-scoped, per req.tripId/req.groupId. */
  saveSplitRequest(req: SplitRequest): Promise<boolean>;
  /** Save-first update of a split request (e.g. a status change) — trip- or group-scoped. */
  updateSplitRequest(req: SplitRequest): Promise<boolean>;

  /** Save-first trip status change. */
  setTripStatus(tripId: string, status: TripStatus): Promise<Result<Trip, AppError>>;

  /** Append a newly-created trip to the cache (no repo call). */
  appendTrip(trip: Trip): void;
  /** Replace a trip in the cache by id (no repo call). */
  replaceTrip(trip: Trip): void;
  /** Remove a trip and its cached expenses/members/split requests (no repo call). */
  removeTrip(tripId: string): void;
  /** Append a newly-created expense to the trip's cache bucket (no repo call). */
  appendExpense(expense: Expense): void;
  /** Replace an expense by id, in its trip's or group's cache bucket — routes
   *  on expense.groupId (no repo call). */
  replaceExpense(expense: Expense): void;
  /** Append a newly-joined member to the trip's member cache (no repo call). */
  appendMember(member: TripMember): void;
  /** Append a SplitRequest to its trip's or group's cache (no repo call). Use after a payment method saves directly to the repo. */
  appendSplitRequest(req: SplitRequest): void;

  /** Switch the active trip without a network call. */
  setActiveTrip(tripId: string | null): void;
  /** Clear all cached state — call on sign-out. */
  resetSession(): void;

  /** Fetch all groups for a user and populate the cache. */
  loadGroups(userId: string): Promise<void>;
  /** Fetch and cache expenses for one group. */
  loadGroupDetail(groupId: string): Promise<void>;
  /** Persist a new group expense optimistically and append to the cache. */
  addGroupExpense(expense: Expense): Promise<void>;
  /** Save-first delete of a group expense — see removeExpense. */
  removeGroupExpense(expenseId: string, groupId: string): Promise<boolean>;
  /** Mark a group expense closed (settledAt set) or reopen it (settledAt null) in the cache — after repo call. */
  settleGroupExpenseInStore(expenseId: string, groupId: string, settledAt: Date | null): void;
  /** Append a saved group expense to the cache (no repo call — expense already persisted by hook). */
  appendGroupExpense(expense: Expense): void;
  /** Replace a group expense in its group's cache bucket by id (no repo call). */
  replaceGroupExpense(expense: Expense): void;
  /** Append a newly-created group to the cache (no repo call). */
  appendGroup(group: Group): void;
  /** Replace a group in the cache by id (no repo call). */
  updateGroupInStore(group: Group): void;
  /** Remove a group from the cache by id (no repo call). */
  removeGroup(groupId: string): void;
  /** Append a new member to a cached group (no repo call). */
  addMemberToGroupInStore(groupId: string, member: GroupMember): void;
  /** Replace a member in a cached group by userId (no repo call). */
  updateGroupMemberInStore(groupId: string, member: GroupMember): void;

  /** Replace the entire recurring expense list for a group in the cache (no repo call). */
  setRecurringExpensesForGroup(groupId: string, items: RecurringExpense[]): void;
  /** Append a newly-created recurring expense to the cache (no repo call). */
  appendRecurringExpense(re: RecurringExpense): void;
  /** Remove a recurring expense from the cache by id (no repo call). */
  removeRecurringExpense(id: string): void;
  /** Replace a recurring expense in the cache by id (no repo call). */
  updateRecurringExpenseInStore(re: RecurringExpense): void;
}

export type ITripSessionStore = TripSessionState & TripSessionActions;
