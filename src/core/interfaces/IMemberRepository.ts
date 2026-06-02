import type { Result } from '../types/Result';
import type { AppError } from '../types/AppError';
import type { TripMember } from '../models/TripMember';

export interface IMemberRepository {
  getMembersForTrip(tripId: string): Promise<Result<TripMember[], AppError>>;
  addMember(member: TripMember): Promise<Result<TripMember, AppError>>;
  removeMember(tripId: string, userId: string): Promise<Result<void, AppError>>;
}
