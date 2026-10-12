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

  async findMemberByEmail(tripId: string, email: string): Promise<Result<TripMember | null, AppError>> {
    const { data, error } = await supabase
      .from('trip_members')
      .select()
      .eq('trip_id', tripId)
      .ilike('email', email)
      .maybeSingle();
    if (error) return err(toAppError(error, 'TripMember'));
    if (!data) return ok(null);
    return rowToMember(data);
  }

  async claimMemberSlot(
    tripId: string,
    placeholderUserId: string,
    newUserId: string,
    newDisplayName: string,
  ): Promise<Result<TripMember, AppError>> {
    const { error: rpcError } = await supabase.rpc('claim_member_slot', {
      p_trip_id: tripId,
      p_placeholder_user_id: placeholderUserId,
    });
    if (rpcError) return err(toAppError(rpcError, 'TripMember'));

    const { data, error } = await supabase
      .from('trip_members')
      .update({ display_name: newDisplayName })
      .eq('trip_id', tripId)
      .eq('user_id', newUserId)
      .select()
      .single();
    if (error || !data) return err(toAppError(error ?? { message: 'Member not found after claim', code: '404', details: '', hint: '' }, 'TripMember'));
    return rowToMember(data);
  }
}

