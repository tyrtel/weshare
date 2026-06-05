import { useState, useEffect, useCallback } from 'react';
import { useService } from '../../../core/di/ServiceContext';
import { TRIP_REPO, MEMBER_REPO, AUTH, TRIP_STORE } from '../../../core/di/tokens';
import { isOk } from '../../../core/types/Result';
import type { Trip } from '../../../core/models/Trip';
import type { AppError } from '../../../core/types/AppError';

interface UseJoinTripState {
  /** The trip resolved from the token — available before the user joins. */
  trip: Trip | null;
  /** True while the initial token→trip lookup is in progress. */
  loading: boolean;
  /** Error from the token lookup (e.g. NotFoundError for bad/expired token). */
  error: AppError | null;
  /** True while the join action is executing. */
  joining: boolean;
  /** Error from the join action itself. */
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

  // Resolve the token to a trip on mount.
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

  // ── Shared join logic ─────────────────────────────────────────────────────

  const _doJoin = useCallback(
    async (userId: string, displayName: string, isGuest: boolean, email?: string): Promise<Trip | null> => {
      const { trip } = state;
      if (!trip) {
        setState(s => ({ ...s, joinError: { kind: 'NotFoundError', resource: 'Trip', id: token } }));
        return null;
      }

      setState(s => ({ ...s, joining: true, joinError: null }));

      // Idempotency: check if already a member.
      const membersResult = await memberRepo.getMembersForTrip(trip.id);
      if (isOk(membersResult)) {
        const alreadyMember = membersResult.value.some(m => m.userId === userId);
        if (alreadyMember) {
          setState(s => ({ ...s, joining: false }));
          return trip;
        }
      }

      // Email-based matching: if the user has an email, check for a placeholder
      // TripMember with that email and merge instead of adding a new row.
      if (email && !isGuest) {
        const matchResult = await memberRepo.findMemberByEmail(trip.id, email);
        if (isOk(matchResult) && matchResult.value) {
          const claimResult = await memberRepo.claimMemberSlot(
            trip.id,
            matchResult.value.userId,
            userId,
            displayName,
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
        userId,
        tripId: trip.id,
        displayName,
        isGuest,
        joinedAt: new Date(),
      });

      if (!isOk(addResult)) {
        setState(s => ({ ...s, joining: false, joinError: addResult.error }));
        return null;
      }

      storeApi.getState().appendMember(addResult.value);
      setState(s => ({ ...s, joining: false }));
      return trip;
    },
    [state, memberRepo, storeApi, token],
  );

  // ── Public join actions ───────────────────────────────────────────────────

  /** Creates an anonymous session then joins the trip. */
  const joinAsGuest = useCallback(
    async (name: string): Promise<Trip | null> => {
      if (!name.trim()) {
        setState(s => ({
          ...s,
          joinError: { kind: 'ValidationError', field: 'name', message: 'Name is required.' },
        }));
        return null;
      }

      setState(s => ({ ...s, joining: true, joinError: null }));

      const authResult = await auth.signInAsGuest(name.trim());
      if (!isOk(authResult)) {
        setState(s => ({ ...s, joining: false, joinError: authResult.error }));
        return null;
      }

      setState(s => ({ ...s, joining: false }));
      return _doJoin(authResult.value.id, authResult.value.name, true);
    },
    [auth, _doJoin],
  );

  /** Joins the trip with the currently signed-in user. */
  const joinAuthenticated = useCallback(async (): Promise<Trip | null> => {
    const user = auth.currentUser();
    if (!user) {
      setState(s => ({
        ...s,
        joinError: { kind: 'AuthError', message: 'You must be signed in to join.' },
      }));
      return null;
    }
    return _doJoin(user.id, user.name, false, user.email);
  }, [auth, _doJoin]);

  return {
    trip:      state.trip,
    loading:   state.loading,
    error:     state.error,
    joining:   state.joining,
    joinError: state.joinError,
    joinAsGuest,
    joinAuthenticated,
  };
}
