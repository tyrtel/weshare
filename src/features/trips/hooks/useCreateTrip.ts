import { useState, useCallback } from 'react';
import { useService } from '../../../core/di/ServiceContext';
import { TRIP_REPO, MEMBER_REPO, AUTH, TRIP_STORE } from '../../../core/di/tokens';
import { isOk } from '../../../core/types/Result';
import { generateId } from '../../../core/utils/generateId';
import type { Trip } from '../../../core/models/Trip';
import type { AppError } from '../../../core/types/AppError';

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
    async (name: string, currency: string): Promise<Trip | null> => {
      setError(null);

      await auth.awaitReady();
      const user = auth.currentUser();
      if (!user) {
        setError({ kind: 'AuthError', message: 'You must be signed in to create a trip.' });
        return null;
      }

      if (!name.trim()) {
        setError({ kind: 'ValidationError', field: 'name', message: 'Trip name is required.' });
        return null;
      }

      setLoading(true);

      const tripId  = generateId();
      const creator = {
        userId:      user.id,
        tripId,
        displayName: user.name,
        isGuest:     false,
        joinedAt:    new Date(),
      };
      const trip: Trip = {
        id:          tripId,
        name:        name.trim(),
        currency,
        ownerId:     user.id,
        createdAt:   new Date(),
        inviteToken: generateInviteToken(),
        status:      'active',
        closedAt:    null,
        members:     [creator],
      };

      try {
        const tripResult = await tripRepo.saveTrip(trip);
        if (!isOk(tripResult)) {
          setError(tripResult.error);
          return null;
        }

        const memberResult = await memberRepo.addMember(creator);
        if (!isOk(memberResult)) {
          setError(memberResult.error);
          return null;
        }

        const saved = { ...tripResult.value, members: [memberResult.value] };
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
