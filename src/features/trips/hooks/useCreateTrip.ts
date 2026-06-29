import { useState, useCallback } from 'react';
import { useService } from '../../../core/di/ServiceContext';
import { TRIP_REPO, MEMBER_REPO, AUTH, TRIP_STORE } from '../../../core/di/tokens';
import { isOk } from '../../../core/types/Result';
import { generateId } from '../../../core/utils/generateId';
import type { Trip } from '../../../core/models/Trip';
import type { TripMember } from '../../../core/models/TripMember';
import type { GroupMember } from '../../../core/models/GroupMember';
import type { AppError } from '../../../core/types/AppError';

interface CreateTripOpts {
  groupId?: string;
  selectedGroupMembers?: GroupMember[];
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      const t = setTimeout(() => reject(new Error(`Request timed out after ${ms / 1000}s`)), ms);
      if (typeof t === 'object' && t !== null) t.unref();
    }),
  ]);
}

// Matches the alphabet in supabase/migrations/002_invite_tokens.sql.
// In production the SQL trigger generates this; in mock/simulation we do it here.
function generateInviteToken(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let token = '';
  for (let i = 0; i < 8; i++) {
    token += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return token;
}

export function useCreateTrip() {
  const tripRepo   = useService(TRIP_REPO);
  const memberRepo = useService(MEMBER_REPO);
  const auth       = useService(AUTH);
  const storeApi   = useService(TRIP_STORE);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  const createTrip = useCallback(
    async (name: string, currency: string, opts?: CreateTripOpts): Promise<Trip | null> => {
      setError(null);
      setLoading(true);

      try {
        await withTimeout(auth.awaitReady(), 8_000);
        const user = auth.currentUser();
        if (!user) {
          setError({ kind: 'AuthError', message: 'You must be signed in to create a trip.' });
          return null;
        }

        if (!name.trim()) {
          setError({ kind: 'ValidationError', field: 'name', message: 'Trip name is required.' });
          return null;
        }

        const tripId  = generateId();
        const creator: TripMember = {
          userId:      user.id,
          tripId,
          displayName: user.name,
          isGuest:     false,
          joinedAt:    new Date(),
          avatarUrl:   user.avatarUrl,
        };

        const extraMembers: TripMember[] = (opts?.selectedGroupMembers ?? [])
          .filter(gm => gm.userId !== user.id)
          .map(gm => ({
            userId:      gm.userId,
            tripId,
            displayName: gm.displayName,
            isGuest:     gm.isGuest,
            joinedAt:    new Date(),
            avatarUrl:   gm.avatarUrl,
          }));

        const allMembers = [creator, ...extraMembers];

        const trip: Trip = {
          id:          tripId,
          name:        name.trim(),
          currency,
          ownerId:     user.id,
          createdAt:   new Date(),
          inviteToken: generateInviteToken(),
          status:      'active',
          closedAt:    null,
          groupId:     opts?.groupId,
          members:     allMembers,
        };

        const tripResult = await withTimeout(tripRepo.saveTrip(trip), 10_000);
        if (!isOk(tripResult)) {
          setError(tripResult.error);
          return null;
        }

        const memberResults = await Promise.all(
          allMembers.map(m => withTimeout(memberRepo.addMember(m), 10_000)),
        );
        const failedMember = memberResults.find(r => !isOk(r));
        if (failedMember && !isOk(failedMember)) {
          setError(failedMember.error);
          return null;
        }

        const savedMembers = memberResults.map(r => (isOk(r) ? r.value : undefined)).filter(Boolean) as TripMember[];
        const saved = { ...tripResult.value, members: savedMembers };
        storeApi.getState().appendTrip(saved);
        return saved;
      } catch (e) {
        setError({ kind: 'NetworkError', message: e instanceof Error ? e.message : 'Unexpected error creating trip' });
        return null;
      } finally {
        setLoading(false);
      }
    },
    [tripRepo, memberRepo, auth, storeApi],
  );

  return { createTrip, loading, error };
}
