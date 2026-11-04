import type { Result } from '../types/Result';
import type { AppError } from '../types/AppError';
import type { TripMember } from '../models/TripMember';
import type { User } from '../models/User';

export interface IMemberRepository {
  getMembersForTrip(tripId: string): Promise<Result<TripMember[], AppError>>;
  /** Members for several trips in one round trip, keyed by tripId (every id present). */
  getMembersForTrips(tripIds: string[]): Promise<Result<Record<string, TripMember[]>, AppError>>;
  addMember(member: TripMember): Promise<Result<TripMember, AppError>>;
  removeMember(tripId: string, userId: string): Promise<Result<void, AppError>>;
  /**
   * Joins the signed-in `user` to the trip behind an invite token. Idempotent.
   * A placeholder member with the user's email is claimed (with its expenses
   * and splits) instead of adding a new row.
   */
  joinTripByInvite(token: string, user: User): Promise<Result<TripMember, AppError>>;
}
