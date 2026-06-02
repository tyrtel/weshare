import { ok } from '../core/types/Result';
import type { Result } from '../core/types/Result';
import type { AppError } from '../core/types/AppError';
import type { IMemberRepository } from '../core/interfaces/IMemberRepository';
import type { TripMember } from '../core/models/TripMember';

export class InMemoryMemberRepository implements IMemberRepository {
  // keyed by tripId → members list
  private readonly members = new Map<string, TripMember[]>();

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
}
