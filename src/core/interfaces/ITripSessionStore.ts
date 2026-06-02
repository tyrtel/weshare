import type { Trip, TripStatus } from '../models/Trip';
import type { TripMember } from '../models/TripMember';
import type { Expense } from '../models/Expense';
import type { Split } from '../models/Split';
import type { SplitRequest } from '../models/SplitRequest';
import type { Result } from '../types/Result';
import type { AppError } from '../types/AppError';

export interface TripSessionState {
  activeTripId: string | null;
  trips: Trip[];
  expenses: Record<string, Expense[]>;        // keyed by tripId
  members: Record<string, TripMember[]>;      // keyed by tripId
  splitRequests: Record<string, SplitRequest[]>; // keyed by tripId
  /** IDs of expenses that have been appended optimistically but not yet confirmed by storage. */
  pendingExpenseIds: string[];
  isHydrated: boolean;
  hydrationError: AppError | null;
}

export interface TripSessionActions {
  /** Fetch all trips for a user and populate the cache. Sets isHydrated on completion. */
  loadTrips(userId: string): Promise<void>;
  /** Fetch and cache expenses + members for one trip. */
  loadTripDetail(tripId: string): Promise<void>;
  /** Fetch and cache split requests for one trip. */
  loadSplitRequests(tripId: string): Promise<void>;

  /** Persist a new expense and append it to the cache (with optimistic write). */
  addExpense(expense: Expense): Promise<void>;
  /** Delete an expense from storage and remove it from the cache. */
  removeExpense(expenseId: string, tripId: string): Promise<void>;
  /** Mark a split as fully paid, persist it, and update the nested split in the cache. */
  markSettled(split: Split): Promise<Result<Split, AppError>>;
  /** Save a new split request to storage and append it to the cache. */
  saveSplitRequest(req: SplitRequest): Promise<void>;
  /** Persist a split-request status change and update the cache in place. */
  updateSplitRequest(req: SplitRequest): Promise<void>;

  /** Persist a trip status change and update the cache in place. */
  setTripStatus(tripId: string, status: TripStatus): Promise<Result<Trip, AppError>>;

  /** Append a newly-created trip to the cache (no repo call). */
  appendTrip(trip: Trip): void;
  /** Replace a trip in the cache by id (no repo call). */
  replaceTrip(trip: Trip): void;
  /** Append a newly-created expense to the trip's cache bucket (no repo call). */
  appendExpense(expense: Expense): void;
  /** Replace an expense in its trip's cache bucket by id (no repo call). */
  replaceExpense(expense: Expense): void;
  /** Append a newly-joined member to the trip's member cache (no repo call). */
  appendMember(member: TripMember): void;
  /** Append a SplitRequest to the trip's cache (no repo call). Use after a payment method saves directly to the repo. */
  appendSplitRequest(req: SplitRequest): void;

  /** Switch the active trip without a network call. */
  setActiveTrip(tripId: string | null): void;
  /** Clear all cached state — call on sign-out. */
  resetSession(): void;
}

export type ITripSessionStore = TripSessionState & TripSessionActions;
