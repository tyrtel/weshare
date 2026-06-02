import { ok, err } from '../core/types/Result';
import type { Result } from '../core/types/Result';
import type { AppError } from '../core/types/AppError';
import type { ITripRepository } from '../core/interfaces/ITripRepository';
import type { Trip, TripStatus } from '../core/models/Trip';

export class InMemoryTripRepository implements ITripRepository {
  private readonly trips = new Map<string, Trip>();

  seed(trips: Trip[]): this {
    trips.forEach(t => this.trips.set(t.id, t));
    return this;
  }

  getTrip = async (id: string): Promise<Result<Trip, AppError>> => {
    const trip = this.trips.get(id);
    if (!trip) return err({ kind: 'NotFoundError', resource: 'Trip', id });
    return ok(trip);
  };

  getTripsForUser = async (userId: string): Promise<Result<Trip[], AppError>> => {
    const result: Trip[] = [];
    for (const trip of this.trips.values()) {
      if (trip.ownerId === userId || trip.members.some(m => m.userId === userId)) {
        result.push(trip);
      }
    }
    return ok(result);
  };

  getTripByInviteToken = async (token: string): Promise<Result<Trip, AppError>> => {
    for (const trip of this.trips.values()) {
      if (trip.inviteToken === token) return ok(trip);
    }
    return err({ kind: 'NotFoundError', resource: 'Trip', id: token });
  };

  saveTrip = async (trip: Trip): Promise<Result<Trip, AppError>> => {
    this.trips.set(trip.id, trip);
    return ok(trip);
  };

  updateTrip = async (trip: Trip): Promise<Result<Trip, AppError>> => {
    if (!this.trips.has(trip.id)) {
      return err({ kind: 'NotFoundError', resource: 'Trip', id: trip.id });
    }
    this.trips.set(trip.id, trip);
    return ok(trip);
  };

  deleteTrip = async (id: string): Promise<Result<void, AppError>> => {
    if (!this.trips.has(id)) {
      return err({ kind: 'NotFoundError', resource: 'Trip', id });
    }
    this.trips.delete(id);
    return ok(undefined);
  };

  setTripStatus = async (tripId: string, status: TripStatus): Promise<Result<Trip, AppError>> => {
    const trip = this.trips.get(tripId);
    if (!trip) return err({ kind: 'NotFoundError', resource: 'Trip', id: tripId });
    const closedAt = status === 'closed' ? new Date() : trip.closedAt;
    const updated: Trip = { ...trip, status, closedAt };
    this.trips.set(tripId, updated);
    return ok(updated);
  };
}
