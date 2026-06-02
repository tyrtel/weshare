import { useState, useCallback } from 'react';
import { useService } from '../../../core/di/ServiceContext';
import { TRIP_REPO, AUTH, TRIP_STORE } from '../../../core/di/tokens';
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
  const tripRepo = useService(TRIP_REPO);
  const auth     = useService(AUTH);
  const storeApi = useService(TRIP_STORE);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  const createTrip = useCallback(
    async (name: string, currency: string): Promise<Trip | null> => {
      setError(null);

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

      const trip: Trip = {
        id: generateId(),
        name: name.trim(),
        currency,
        ownerId: user.id,
        createdAt: new Date(),
        inviteToken: generateInviteToken(),
        members: [
          {
            userId: user.id,
            tripId: '',   // filled by storage; set below after we know the id
            displayName: user.name,
            isGuest: false,
            joinedAt: new Date(),
          },
        ],
      };
      // Patch the member's tripId now that we have the trip id.
      trip.members[0] = { ...trip.members[0], tripId: trip.id };

      const result = await tripRepo.saveTrip(trip);
      setLoading(false);

      if (!isOk(result)) {
        setError(result.error);
        return null;
      }

      storeApi.getState().appendTrip(result.value);

      return result.value;
    },
    [tripRepo, auth, storeApi],
  );

  return { createTrip, loading, error };
}
