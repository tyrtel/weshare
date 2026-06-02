import { ok, err } from '../../core/types/Result';
import type { Result } from '../../core/types/Result';
import type { AppError } from '../../core/types/AppError';
import type { IMemberRepository } from '../../core/interfaces/IMemberRepository';
import type { TripMember } from '../../core/models/TripMember';
import { supabase } from './supabaseClient';
import { toAppError } from './supabaseErrors';
import { parseMemberRow, mapRows } from './rowSchemas';

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
    ...(row.phone != null && { phone: row.phone }),
    ...(row.email != null && { email: row.email }),
  });
}

export class SupabaseMemberRepository implements IMemberRepository {
  async getMembersForTrip(tripId: string): Promise<Result<TripMember[], AppError>> {
    const { data, error } = await supabase
      .from('trip_members')
      .select()
      .eq('trip_id', tripId);
    if (error) return err(toAppError(error, 'TripMember'));
    return mapRows(data as unknown[], rowToMember);
  }

  async addMember(member: TripMember): Promise<Result<TripMember, AppError>> {
    const { data, error } = await supabase
      .from('trip_members')
      .insert({
        trip_id:      member.tripId,
        user_id:      member.userId,
        display_name: member.displayName,
        is_guest:     member.isGuest,
        phone:        member.phone ?? null,
        email:        member.email ?? null,
      })
      .select()
      .single();
    if (error) return err(toAppError(error, 'TripMember'));
    return rowToMember(data);
  }

  async removeMember(tripId: string, userId: string): Promise<Result<void, AppError>> {
    const { error } = await supabase
      .from('trip_members')
      .delete()
      .eq('trip_id', tripId)
      .eq('user_id', userId);
    if (error) return err(toAppError(error, 'TripMember'));
    return ok(undefined);
  }
}

