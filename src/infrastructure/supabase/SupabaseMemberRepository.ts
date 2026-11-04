import { ok, err } from '../../core/types/Result';
import type { Result } from '../../core/types/Result';
import type { AppError } from '../../core/types/AppError';
import type { IMemberRepository } from '../../core/interfaces/IMemberRepository';
import type { TripMember } from '../../core/models/TripMember';
import type { User } from '../../core/models/User';
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
    ...(row.phone      != null && { phone:     row.phone }),
    ...(row.email      != null && { email:     row.email }),
    ...(row.avatar_url != null && { avatarUrl: row.avatar_url }),
  });
}

// Must not exceed the project's PostgREST max_rows (Supabase default 1000): a
// short page is how getMembersForTrips knows it has reached the end.
const PAGE_SIZE = 1000;

export class SupabaseMemberRepository implements IMemberRepository {
  async getMembersForTrip(tripId: string): Promise<Result<TripMember[], AppError>> {
    const { data, error } = await supabase
      .from('trip_members')
      .select()
      .eq('trip_id', tripId);
    if (error) return err(toAppError(error, 'TripMember'));
    return mapRows(data as unknown[], rowToMember);
  }

  async getMembersForTrips(tripIds: string[]): Promise<Result<Record<string, TripMember[]>, AppError>> {
    const byTrip: Record<string, TripMember[]> = Object.fromEntries(tripIds.map(id => [id, []]));
    if (tripIds.length === 0) return ok(byTrip);

    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from('trip_members')
        .select()
        .in('trip_id', tripIds)
        .order('trip_id', { ascending: true })
        .order('user_id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) return err(toAppError(error, 'TripMember'));

      const mapped = mapRows(data as unknown[], rowToMember);
      if (!mapped.ok) return mapped;
      for (const m of mapped.value) byTrip[m.tripId].push(m);
      if (mapped.value.length < PAGE_SIZE) return ok(byTrip);
    }
  }

  async addMember(member: TripMember): Promise<Result<TripMember, AppError>> {
    const { data, error } = await supabase
      .from('trip_members')
      .insert({
        trip_id:      member.tripId,
        user_id:      member.userId,
        display_name: member.displayName,
        is_guest:     member.isGuest,
        phone:        member.phone     ?? null,
        email:        member.email     ?? null,
        avatar_url:   member.avatarUrl ?? null,
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

  async joinTripByInvite(token: string, user: User): Promise<Result<TripMember, AppError>> {
    const { data, error } = await supabase
      .rpc('join_trip_by_invite', {
        p_token:        token,
        p_display_name: user.name,
        p_avatar_url:   user.avatarUrl ?? null,
      })
      .single();
    if (error) return err(toAppError(error, 'Trip', token));
    return rowToMember(data);
  }
}
