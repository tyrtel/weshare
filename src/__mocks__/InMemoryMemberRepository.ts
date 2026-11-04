import { ok, err, isOk } from '../core/types/Result';
import type { Result } from '../core/types/Result';
import type { AppError } from '../core/types/AppError';
import type { IMemberRepository } from '../core/interfaces/IMemberRepository';
import type { TripMember } from '../core/models/TripMember';
import type { User } from '../core/models/User';
import type { ITripRepository } from '../core/interfaces/ITripRepository';

export class InMemoryMemberRepository implements IMemberRepository {
  // keyed by tripId → members list
  private readonly members = new Map<string, TripMember[]>();

  // `trips` resolves invite tokens for joinTripByInvite.
  constructor(private readonly trips?: ITripRepository) {}

  seed(members: TripMember[]): this {
    for (const m of members) {
      const existing = this.members.get(m.tripId) ?? [];
      existing.push(m);
      this.members.set(m.tripId, existing);
    }
    return this;
  }

  getMembersForTrip = async (tripId: string): Promise<Result<TripMember[], AppError>> => {
    return ok(this.members.get(tripId) ?? []);
  };

  getMembersForTrips = async (tripIds: string[]): Promise<Result<Record<string, TripMember[]>, AppError>> => {
    return ok(Object.fromEntries(tripIds.map(id => [id, this.members.get(id) ?? []])));
  };

  addMember = async (member: TripMember): Promise<Result<TripMember, AppError>> => {
    const existing = this.members.get(member.tripId) ?? [];
    this.members.set(member.tripId, [...existing, member]);
    return ok(member);
  };

  removeMember = async (tripId: string, userId: string): Promise<Result<void, AppError>> => {
    const existing = this.members.get(tripId) ?? [];
    this.members.set(tripId, existing.filter(m => m.userId !== userId));
    return ok(undefined);
  };

  joinTripByInvite = async (token: string, user: User): Promise<Result<TripMember, AppError>> => {
    if (!this.trips) throw new Error('InMemoryMemberRepository needs a trip repository to join by invite');
    const invite = await this.trips.getTripInvitePreview(token);
    if (!isOk(invite)) return invite;
    const tripId = invite.value.id;
    const list = this.members.get(tripId) ?? [];

    const existing = list.find(m => m.userId === user.id);
    if (existing) return ok(existing);

    const email = user.email?.toLowerCase();
    const idx = email ? list.findIndex(m => m.email?.toLowerCase() === email) : -1;
    if (idx !== -1) {
      const claimed: TripMember = { ...list[idx], userId: user.id, displayName: user.name, isGuest: false, avatarUrl: user.avatarUrl ?? list[idx].avatarUrl };
      this.members.set(tripId, list.map((m, i) => (i === idx ? claimed : m)));
      return ok(claimed);
    }
    if (invite.value.expired) {
      return err({ kind: 'ValidationError', field: 'inviteToken', message: 'Invite expired' });
    }

    const added: TripMember = { userId: user.id, tripId, displayName: user.name, isGuest: false, joinedAt: new Date(), avatarUrl: user.avatarUrl };
    this.members.set(tripId, [...list, added]);
    return ok(added);
  };
}
