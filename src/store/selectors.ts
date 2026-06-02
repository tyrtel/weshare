import type { ITripSessionStore } from '../core/interfaces/ITripSessionStore';
import type { Expense } from '../core/models/Expense';
import type { TripMember } from '../core/models/TripMember';
import type { SplitRequest } from '../core/models/SplitRequest';

// Stable sentinels — same reference every time the bucket is empty, so
// Zustand selectors don't trigger spurious re-renders.
const EMPTY_EXPENSES:       Expense[]       = [];
const EMPTY_MEMBERS:        TripMember[]    = [];
const EMPTY_SPLIT_REQUESTS: SplitRequest[]  = [];

export function selectExpenses(state: ITripSessionStore, tripId: string): Expense[] {
  return state.expenses[tripId] ?? EMPTY_EXPENSES;
}

export function selectMembers(state: ITripSessionStore, tripId: string): TripMember[] {
  return state.members[tripId] ?? EMPTY_MEMBERS;
}

export function selectSplitRequests(state: ITripSessionStore, tripId: string): SplitRequest[] {
  return state.splitRequests[tripId] ?? EMPTY_SPLIT_REQUESTS;
}
