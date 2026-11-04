import type { Result } from '../types/Result';
import type { AppError } from '../types/AppError';
import type { Trip, TripStatus } from '../models/Trip';
import type { InvitePreview } from '../models/InvitePreview';

export interface ITripRepository {
  getTrip(id: string): Promise<Result<Trip, AppError>>;
  getTripsForUser(userId: string): Promise<Result<Trip[], AppError>>;
  getTripInvitePreview(token: string): Promise<Result<InvitePreview, AppError>>;
  setInviteTtl(tripId: string, ttlHours: number | null): Promise<Result<Trip, AppError>>;
  /** Owner only: issues a new token and restarts the expiry clock. */
  resetInvite(tripId: string): Promise<Result<Trip, AppError>>;
  saveTrip(trip: Trip): Promise<Result<Trip, AppError>>;
  updateTrip(trip: Trip): Promise<Result<Trip, AppError>>;
  deleteTrip(id: string): Promise<Result<void, AppError>>;
  setTripStatus(tripId: string, status: TripStatus): Promise<Result<Trip, AppError>>;
}
