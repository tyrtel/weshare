import { useState, useCallback } from 'react';
import { useService } from '../../../core/di/ServiceContext';
import { GROUP_REPO, TRIP_STORE } from '../../../core/di/tokens';
import type { GroupMember } from '../../../core/models/GroupMember';
import type { AppError } from '../../../core/types/AppError';
import { generateId } from '../../../core/utils/generateId';

export interface AddGroupMemberInput {
  displayName: string;
  email?: string;
  phone?: string;
}

export function useAddGroupMember(groupId: string) {
  const groupRepo = useService(GROUP_REPO);
  const storeApi  = useService(TRIP_STORE);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<AppError | null>(null);

  const addMember = useCallback(async (input: AddGroupMemberInput): Promise<GroupMember | null> => {
    const name = input.displayName.trim();
    if (!name) {
      setError({ kind: 'ValidationError', field: 'displayName', message: 'Name is required' });
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const member: GroupMember = {
        userId:      `guest_${generateId()}`,
        groupId,
        displayName: name,
        isGuest:     true,
        joinedAt:    new Date(),
        email:       input.email?.trim() || undefined,
        phone:       input.phone?.trim() || undefined,
      };

      const result = await groupRepo.addMember(member);

      if (!result.ok) {
        setError(result.error);
        return null;
      }

      storeApi.getState().addMemberToGroupInStore(groupId, result.value);
      return result.value;
    } catch (e) {
      // A thrown exception (a real network failure, distinct from the repo
      // returning Result.err) used to propagate uncaught — loading never
      // reset and the caller's post-save navigation never ran.
      setError({ kind: 'NetworkError', message: e instanceof Error ? e.message : 'Unexpected error' });
      return null;
    } finally {
      setLoading(false);
    }
  }, [groupRepo, storeApi, groupId]);

  return { addMember, loading, error };
}
