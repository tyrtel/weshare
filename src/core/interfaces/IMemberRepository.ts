import type { Result } from '../types/Result';
import type { AppError } from '../types/AppError';
import type { TripMember } from '../models/TripMember';

export interface IMemberRepository {
  getMembersForTrip(tripId: string): Promise<Result<TripMember[], AppError>>;
  addMember(member: TripMember): Promise<Result<TripMember, AppError>>;
  removeMember(tripId: string, userId: string): Promise<Result<void, AppError>>;
  // Returns the first member on a trip whose email matches, or null if none.
  // Used during the invite join flow to detect placeholder participants.
  findMemberByEmail(tripId: string, email: string): Promise<Result<TripMember | null, AppError>>;
  // Transfers a placeholder member slot to an authenticated user.
  // Updates the member's userId in-place so their expenses/splits carry over.
  claimMemberSlot(tripId: string, placeholderUserId: string, newUserId: string, newDisplayName: string): Promise<Result<TripMember, AppError>>;
}
