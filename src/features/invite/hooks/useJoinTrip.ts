import { useState, useEffect, useCallback } from 'react';
import { useService } from '../../../core/di/ServiceContext';
import { TRIP_REPO, MEMBER_REPO, AUTH, TRIP_STORE } from '../../../core/di/tokens';
import { isOk } from '../../../core/types/Result';
import type { InvitePreview } from '../../../core/models/InvitePreview';
import type { AppError } from '../../../core/types/AppError';

interface UseJoinTripState {
  trip: InvitePreview | null;
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
      setState(s => ({ ...s, loading: false, error: { kind: 'ValidationError', field: 'token', message: 'Invite token is missing.' } }));
      return;
    }
    setState(s => ({ ...s, loading: true, error: null }));
    tripRepo.getTripInvitePreview(token).then(result => {
      if (isOk(result)) {
        setState(s => ({ ...s, trip: result.value, loading: false }));
      } else {
        setState(s => ({ ...s, trip: null, loading: false, error: result.error }));
      }
    });
  }, [token, tripRepo]);

  const joinAuthenticated = useCallback(async (): Promise<InvitePreview | null> => {
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

    try {
      const result = await memberRepo.joinTripByInvite(token, user);
      if (!isOk(result)) {
        setState(s => ({ ...s, joinError: result.error }));
        return null;
      }
      storeApi.getState().appendMember(result.value);
      return trip;
    } catch (e) {
      // A thrown exception (a real network failure, distinct from a repo
      // returning Result.err) used to propagate uncaught — `joining` never
      // reset and the caller's post-join navigation never ran.
      setState(s => ({ ...s, joinError: { kind: 'NetworkError', message: e instanceof Error ? e.message : 'Unexpected error' } }));
      return null;
    } finally {
      setState(s => ({ ...s, joining: false }));
    }
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
