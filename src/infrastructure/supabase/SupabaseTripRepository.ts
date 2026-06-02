import { ok, err } from '../../core/types/Result';
import type { Result } from '../../core/types/Result';
import type { AppError } from '../../core/types/AppError';
import type { ITripRepository } from '../../core/interfaces/ITripRepository';
import type { Trip, TripStatus } from '../../core/models/Trip';
import type { TripMember } from '../../core/models/TripMember';
import { supabase } from './supabaseClient';
import { toAppError } from './supabaseErrors';
import { parseTripRow, parseMemberRow, mapRows } from './rowSchemas';

function rowToMember(raw: unknown): Result<TripMember, AppError> {
  const parsed = parseMemberRow(raw);
  if (!parsed.ok) return parsed;
  const row = parsed.value;
  return ok({
    userId:      row.user_id,
    tripId:      row.trip_id,
    displayName: row.display_name,
    isGuest:     row.is_guest,
    joinedAt:    new Date(row.joined_at),
  });
}

function rowToTrip(rawRow: unknown, rawMembers: unknown[]): Result<Trip, AppError> {
  const parsedTrip = parseTripRow(rawRow);
  if (!parsedTrip.ok) return parsedTrip;

  const membersResult = mapRows(rawMembers, rowToMember);
  if (!membersResult.ok) return membersResult;

  const row = parsedTrip.value;
  return ok({
    id:          row.id,
    name:        row.name,
    currency:    row.currency,
    ownerId:     row.owner_id,
    createdAt:   new Date(row.created_at),
    inviteToken: row.invite_token ?? undefined,
    status:      row.status as TripStatus,
    closedAt:    row.closed_at ? new Date(row.closed_at) : null,
    members:     membersResult.value,
  });
}

type RawTripWithMembers = { trip_members?: unknown[] } & Record<string, unknown>;

export class SupabaseTripRepository implements ITripRepository {
  async getTrip(id: string): Promise<Result<Trip, AppError>> {
    const { data, error } = await supabase
      .from('trips')
      .select('*, trip_members(*)')
      .eq('id', id)
      .single();
    if (error) return err(toAppError(error, 'Trip', id));
    const raw = data as RawTripWithMembers;
    return rowToTrip(raw, raw.trip_members ?? []);
  }

  async getTripsForUser(userId: string): Promise<Result<Trip[], AppError>> {
    const { data: owned, error: e1 } = await supabase
      .from('trips')
      .select('*, trip_members(*)')
      .eq('owner_id', userId);
    if (e1) return err(toAppError(e1, 'Trip'));

    const { data: membered, error: e2 } = await supabase
      .from('trips')
      .select('*, trip_members!inner(*)')
      .eq('trip_members.user_id', userId)
      .neq('owner_id', userId);
    if (e2) return err(toAppError(e2, 'Trip'));

    const seen = new Set<string>();
    const trips: Trip[] = [];
    for (const row of [...(owned ?? []), ...(membered ?? [])]) {
      const raw = row as RawTripWithMembers;
      const id = raw['id'] as string;
      if (seen.has(id)) continue;
      seen.add(id);
      const result = rowToTrip(raw, raw.trip_members ?? []);
      if (!result.ok) return result;
      trips.push(result.value);
    }
    return ok(trips);
  }

  async getTripByInviteToken(token: string): Promise<Result<Trip, AppError>> {
    const { data, error } = await supabase
      .from('trips')
      .select('*, trip_members(*)')
      .eq('invite_token', token)
      .single();
    if (error) return err(toAppError(error, 'Trip', token));
    const raw = data as RawTripWithMembers;
    return rowToTrip(raw, raw.trip_members ?? []);
  }

  async saveTrip(trip: Trip): Promise<Result<Trip, AppError>> {
    const { data, error } = await supabase
      .from('trips')
      .insert({
        id:           trip.id,
        name:         trip.name,
        currency:     trip.currency,
        owner_id:     trip.ownerId,
        invite_token: trip.inviteToken ?? null,
        status:       trip.status,
        closed_at:    trip.closedAt?.toISOString() ?? null,
      })
      .select('*, trip_members(*)')
      .single();
    if (error) return err(toAppError(error, 'Trip', trip.id));
    const raw = data as RawTripWithMembers;
    return rowToTrip(raw, raw.trip_members ?? []);
  }

  async updateTrip(trip: Trip): Promise<Result<Trip, AppError>> {
    const { data, error } = await supabase
      .from('trips')
      .update({ name: trip.name, currency: trip.currency, invite_token: trip.inviteToken ?? null, status: trip.status, closed_at: trip.closedAt?.toISOString() ?? null })
      .eq('id', trip.id)
      .select('*, trip_members(*)')
      .single();
    if (error) return err(toAppError(error, 'Trip', trip.id));
    const raw = data as RawTripWithMembers;
    return rowToTrip(raw, raw.trip_members ?? []);
  }

  async deleteTrip(id: string): Promise<Result<void, AppError>> {
    const { error } = await supabase.from('trips').delete().eq('id', id);
    if (error) return err(toAppError(error, 'Trip', id));
    return ok(undefined);
  }

  async setTripStatus(tripId: string, status: TripStatus): Promise<Result<Trip, AppError>> {
    const { data, error } = await supabase
      .from('trips')
      .update({ status, ...(status === 'closed' ? { closed_at: new Date().toISOString() } : {}) })
      .eq('id', tripId)
      .select('*, trip_members(*)')
      .single();
    if (error) return err(toAppError(error, 'Trip', tripId));
    const raw = data as RawTripWithMembers;
    return rowToTrip(raw, raw.trip_members ?? []);
  }
}
