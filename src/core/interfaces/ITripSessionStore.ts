import type { Trip } from '../models/Trip';
import type { TripMember } from '../models/TripMember';
import type { Expense } from '../models/Expense';
import type { Split } from '../models/Split';
import type { AppError } from '../types/AppError';

export interface TripSessionState {
  activeTripId: string | null;
  trips: Trip[];
  expenses: Record<string, Expense[]>;   // keyed by tripId
  members: Record<string, TripMember[]>; // keyed by tripId
  isHydrated: boolean;
  hydrationError: AppError | null;
}

export interface TripSessionActions {
  /** Fetch all trips for a user and populate the cache. Sets isHydrated on completion. */
  loadTrips(userId: string): Promise<void>;
  /** Fetch and cache expenses + members for one trip. */
  loadTripDetail(tripId: string): Promise<void>;
  /** Persist a new expense and append it to the cache. */
  addExpense(expense: Expense): Promise<void>;
  /** Delete an expense from storage and remove it from the cache. */
  removeExpense(expenseId: string, tripId: string): Promise<void>;
  /** Mark a split as fully paid, persist it, and update the nested split in the cache. */
  markSettled(split: Split): Promise<void>;
  /** Switch the active trip without a network call. */
  setActiveTrip(tripId: string | null): void;
  /** Clear all cached state — call on sign-out. */
  resetSession(): void;
}

export type ITripSessionStore = TripSessionState & TripSessionActions;
