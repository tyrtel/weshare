import { ok, err } from '../core/types/Result';
import type { Result } from '../core/types/Result';
import type { AppError } from '../core/types/AppError';
import type { ITripRepository } from '../core/interfaces/ITripRepository';
import type { Trip, TripStatus } from '../core/models/Trip';
import type { InvitePreview } from '../core/models/InvitePreview';
import { generateId } from '../core/utils/generateId';
import { DEFAULT_TRIP_INVITE_TTL_HOURS, inviteLinkStatus } from '../core/logic/inviteLink';

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

  getTripInvitePreview = async (token: string): Promise<Result<InvitePreview, AppError>> => {
    for (const trip of this.trips.values()) {
      if (trip.inviteToken !== token) continue;
      const status = inviteLinkStatus(trip.inviteCreatedAt, trip.inviteTtlHours, new Date(), trip.status === 'closed');
      return ok({ id: trip.id, name: trip.name, expired: status.kind === 'expired' || status.kind === 'closed' });
    }
    return err({ kind: 'NotFoundError', resource: 'Trip', id: token });
  };

  // Mirrors the database defaults for the invite columns.
  saveTrip = async (trip: Trip): Promise<Result<Trip, AppError>> => {
    const saved: Trip = {
      ...trip,
      inviteToken:     trip.inviteToken ?? generateId().slice(0, 8),
      inviteCreatedAt: trip.inviteCreatedAt ?? new Date(),
      inviteTtlHours:  trip.inviteTtlHours === undefined ? DEFAULT_TRIP_INVITE_TTL_HOURS : trip.inviteTtlHours,
    };
    this.trips.set(trip.id, saved);
    return ok(saved);
  };

  setInviteTtl = async (tripId: string, ttlHours: number | null): Promise<Result<Trip, AppError>> => {
    const trip = this.trips.get(tripId);
    if (!trip) return err({ kind: 'NotFoundError', resource: 'Trip', id: tripId });
    const updated: Trip = { ...trip, inviteTtlHours: ttlHours };
    this.trips.set(tripId, updated);
    return ok(updated);
  };

  resetInvite = async (tripId: string): Promise<Result<Trip, AppError>> => {
    const trip = this.trips.get(tripId);
    if (!trip) return err({ kind: 'NotFoundError', resource: 'Trip', id: tripId });
    const updated: Trip = { ...trip, inviteToken: generateId().slice(0, 8), inviteCreatedAt: new Date() };
    this.trips.set(tripId, updated);
    return ok(updated);
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
