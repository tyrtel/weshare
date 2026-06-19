import { useState, useEffect, useCallback } from 'react';
import { useService } from '../../../core/di/ServiceContext';
import { TRIP_REPO, MEMBER_REPO, AUTH, TRIP_STORE } from '../../../core/di/tokens';
import { isOk } from '../../../core/types/Result';
import type { Trip } from '../../../core/models/Trip';
import type { AppError } from '../../../core/types/AppError';

interface UseJoinTripState {
  trip: Trip | null;
  loading: boolean;
  error: AppError | null;
  joining: boolean;
  joinError: AppError | null;
}

export function useJoinTrip(token: string) {
  const tripRepo   = useService(TRIP_REPO);
  const memberRepo = useService(MEMBER_REPO);
  const auth       = useService(AUTH);
  const storeApi   = useService(TRIP_STORE);

  const [state, setState] = useState<UseJoinTripState>({
    trip: null,
    loading: true,
    error: null,
    joining: false,
    joinError: null,
  });

  useEffect(() => {
    if (!token) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState(s => ({ ...s, loading: false, error: { kind: 'ValidationError', field: 'token', message: 'Invite token is missing.' } }));
      return;
    }
    setState(s => ({ ...s, loading: true, error: null }));
    tripRepo.getTripByInviteToken(token).then(result => {
      if (isOk(result)) {
        setState(s => ({ ...s, trip: result.value, loading: false }));
      } else {
        setState(s => ({ ...s, trip: null, loading: false, error: result.error }));
      }
    });
  }, [token, tripRepo]);

  const joinAuthenticated = useCallback(async (): Promise<Trip | null> => {
    const { trip } = state;
    const user = auth.currentUser();

    if (!user) {
      setState(s => ({ ...s, joinError: { kind: 'AuthError', message: 'You must be signed in to join.' } }));
      return null;
    }
    if (!trip) {
      setState(s => ({ ...s, joinError: { kind: 'NotFoundError', resource: 'Trip', id: token } }));
      return null;
    }

    setState(s => ({ ...s, joining: true, joinError: null }));

    // Idempotency: skip if already a member.
    const membersResult = await memberRepo.getMembersForTrip(trip.id);
    if (isOk(membersResult) && membersResult.value.some(m => m.userId === user.id)) {
      setState(s => ({ ...s, joining: false }));
      return trip;
    }

    // Email-based matching: merge into a placeholder row if email matches.
    if (user.email) {
      const matchResult = await memberRepo.findMemberByEmail(trip.id, user.email);
      if (isOk(matchResult) && matchResult.value) {
        const claimResult = await memberRepo.claimMemberSlot(
          trip.id,
          matchResult.value.userId,
          user.id,
          user.name,
        );
        if (!isOk(claimResult)) {
          setState(s => ({ ...s, joining: false, joinError: claimResult.error }));
          return null;
        }
        storeApi.getState().appendMember(claimResult.value);
        setState(s => ({ ...s, joining: false }));
        return trip;
      }
    }

    const addResult = await memberRepo.addMember({
      userId:      user.id,
      tripId:      trip.id,
      displayName: user.name,
      isGuest:     false,
      joinedAt:    new Date(),
      avatarUrl:   user.avatarUrl,
    });

    if (!isOk(addResult)) {
      setState(s => ({ ...s, joining: false, joinError: addResult.error }));
      return null;
    }

    storeApi.getState().appendMember(addResult.value);
    setState(s => ({ ...s, joining: false }));
    return trip;
  }, [state, auth, memberRepo, storeApi, token]);

  return {
    trip:      state.trip,
    loading:   state.loading,
    error:     state.error,
    joining:   state.joining,
    joinError: state.joinError,
    joinAuthenticated,
  };
}
