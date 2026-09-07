import { useState, useEffect, useCallback } from 'react';
import { useService } from '../../../core/di/ServiceContext';
import { GROUP_REPO, AUTH, TRIP_STORE } from '../../../core/di/tokens';
import { isOk } from '../../../core/types/Result';
import type { Group } from '../../../core/models/Group';
import type { AppError } from '../../../core/types/AppError';

interface UseJoinGroupState {
  group: Group | null;
  loading: boolean;
  error: AppError | null;
  joining: boolean;
  joinError: AppError | null;
}

/**
 * Group-scoped counterpart of features/invite/hooks/useJoinTrip — resolves an
 * invite token to a group, then (once signed in) either claims a matching
 * placeholder member by email or adds a brand-new membership row.
 */
export function useJoinGroup(token: string) {
  const groupRepo = useService(GROUP_REPO);
  const auth      = useService(AUTH);
  const storeApi  = useService(TRIP_STORE);

  const [state, setState] = useState<UseJoinGroupState>({
    group: null,
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
    groupRepo.getGroupByInviteToken(token).then(result => {
      if (isOk(result)) {
        setState(s => ({ ...s, group: result.value, loading: false }));
      } else {
        setState(s => ({ ...s, group: null, loading: false, error: result.error }));
      }
    });
  }, [token, groupRepo]);

  const joinAuthenticated = useCallback(async (): Promise<Group | null> => {
    const { group } = state;
    const user = auth.currentUser();

    if (!user) {
      setState(s => ({ ...s, joinError: { kind: 'AuthError', message: 'You must be signed in to join.' } }));
      return null;
    }
    if (!group) {
      setState(s => ({ ...s, joinError: { kind: 'NotFoundError', resource: 'Group', id: token } }));
      return null;
    }

    setState(s => ({ ...s, joining: true, joinError: null }));

    try {
      // Idempotency: skip if already a member. Re-fetch rather than trusting
      // the hook's own (possibly stale) `group` snapshot, since a prior join
      // in the same session doesn't update it.
      const currentResult = await groupRepo.getGroup(group.id);
      if (isOk(currentResult) && currentResult.value.members.some(m => m.userId === user.id)) {
        return group;
      }

      // Email-based matching: merge into a placeholder row if email matches.
      if (user.email) {
        const matchResult = await groupRepo.findMemberByEmail(group.id, user.email);
        if (isOk(matchResult) && matchResult.value) {
          const claimResult = await groupRepo.claimGroupMemberSlot(
            group.id,
            matchResult.value.userId,
            user.id,
            user.name,
          );
          if (!isOk(claimResult)) {
            setState(s => ({ ...s, joinError: claimResult.error }));
            return null;
          }
          storeApi.getState().addMemberToGroupInStore(group.id, claimResult.value);
          return group;
        }
      }

      const addResult = await groupRepo.addMember({
        userId:      user.id,
        groupId:     group.id,
        displayName: user.name,
        isGuest:     false,
        joinedAt:    new Date(),
        avatarUrl:   user.avatarUrl,
      });

      if (!isOk(addResult)) {
        setState(s => ({ ...s, joinError: addResult.error }));
        return null;
      }

      storeApi.getState().addMemberToGroupInStore(group.id, addResult.value);
      return group;
    } catch (e) {
      // A thrown exception (a real network failure, distinct from a repo
      // returning Result.err) used to propagate uncaught — `joining` never
      // reset and the caller's post-join navigation never ran.
      setState(s => ({ ...s, joinError: { kind: 'NetworkError', message: e instanceof Error ? e.message : 'Unexpected error' } }));
      return null;
    } finally {
      setState(s => ({ ...s, joining: false }));
    }
  }, [state, auth, groupRepo, storeApi, token]);

  return {
    group:     state.group,
    loading:   state.loading,
    error:     state.error,
    joining:   state.joining,
    joinError: state.joinError,
    joinAuthenticated,
  };
}
