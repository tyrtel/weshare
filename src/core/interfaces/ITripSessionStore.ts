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
}

export interface TripSessionActions {
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
  /** Delete an expense from storage and remove it from the cache. Resolves
   *  false (never rejects) on failure, so a caller can gate navigation on it
   *  instead of always proceeding as if the delete had succeeded. */
  removeExpense(expenseId: string, tripId: string): Promise<boolean>;
  /** Mark a split as fully paid, persist it, and update the nested split in the cache. */
  markSettled(split: Split): Promise<Result<Split, AppError>>;
  /** Save a new split request to storage and append it to the cache — trip- or group-scoped, per req.tripId/req.groupId. */
  saveSplitRequest(req: SplitRequest): Promise<void>;
  /** Persist a split-request status change and update the cache in place — trip- or group-scoped. */
  updateSplitRequest(req: SplitRequest): Promise<void>;

  /** Persist a trip status change and update the cache in place. */
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
  /** Delete a group expense from storage and remove it from the cache.
   *  Resolves false (never rejects) on failure — see removeExpense. */
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
