import type { Result } from '../types/Result';
import type { AppError } from '../types/AppError';

export interface IShareService {
  // Opens the native share sheet with a pre-built invite link for the trip.
  shareTrip(tripId: string, tripName: string): Promise<Result<void, AppError>>;
}
