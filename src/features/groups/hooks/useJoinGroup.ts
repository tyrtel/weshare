import { useState, useEffect, useCallback } from 'react';
import { useService } from '../../../core/di/ServiceContext';
import { GROUP_REPO, AUTH, TRIP_STORE } from '../../../core/di/tokens';
import { isOk } from '../../../core/types/Result';
import type { InvitePreview } from '../../../core/models/InvitePreview';
import type { AppError } from '../../../core/types/AppError';

interface UseJoinGroupState {
  group: InvitePreview | null;
  loading: boolean;
  error: AppError | null;
  joining: boolean;
  joinError: AppError | null;
}

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
    groupRepo.getGroupInvitePreview(token).then(result => {
      if (isOk(result)) {
        setState(s => ({ ...s, group: result.value, loading: false }));
      } else {
        setState(s => ({ ...s, group: null, loading: false, error: result.error }));
      }
    });
  }, [token, groupRepo]);

  const joinAuthenticated = useCallback(async (): Promise<InvitePreview | null> => {
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
      const result = await groupRepo.joinGroupByInvite(token, user);
      if (!isOk(result)) {
        setState(s => ({ ...s, joinError: result.error }));
        return null;
      }
      storeApi.getState().addMemberToGroupInStore(group.id, result.value);
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
