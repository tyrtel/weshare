import { useState, useCallback } from 'react';
import { useService } from '../../../core/di/ServiceContext';
import { GROUP_REPO, AUTH, TRIP_STORE } from '../../../core/di/tokens';
import { isOk } from '../../../core/types/Result';
import { generateId } from '../../../core/utils/generateId';
import type { Group } from '../../../core/models/Group';
import type { AppError } from '../../../core/types/AppError';

function generateInviteToken(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let token = '';
  for (let i = 0; i < 8; i++) token += alphabet[Math.floor(Math.random() * alphabet.length)];
  return token;
}

export function useCreateGroup() {
  const groupRepo = useService(GROUP_REPO);
  const auth      = useService(AUTH);
  const storeApi  = useService(TRIP_STORE);

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<AppError | null>(null);

  const createGroup = useCallback(
    async (name: string, currency: string): Promise<Group | null> => {
      setError(null);
      setLoading(true);
      try {
        const user = auth.currentUser();
        if (!user) {
          setError({ kind: 'AuthError', message: 'You must be signed in to create a group.' });
          return null;
        }
        if (!name.trim()) {
          setError({ kind: 'ValidationError', field: 'name', message: 'Group name is required.' });
          return null;
        }
        const groupId = generateId();
        const owner = {
          userId:      user.id,
          groupId,
          displayName: user.name,
          isGuest:     false,
          joinedAt:    new Date(),
          avatarUrl:   user.avatarUrl,
        };
        const group: Group = {
          id:          groupId,
          name:        name.trim(),
          currency,
          ownerId:     user.id,
          createdAt:   new Date(),
          inviteToken: generateInviteToken(),
          members:     [owner],
        };
        const result = await groupRepo.saveGroup(group);
        if (!isOk(result)) { setError(result.error); return null; }
        storeApi.getState().appendGroup(result.value);
        return result.value;
      } catch (e) {
        setError({ kind: 'NetworkError', message: e instanceof Error ? e.message : 'Unexpected error' });
        return null;
      } finally {
        setLoading(false);
      }
    },
    [groupRepo, auth, storeApi],
  );

  return { createGroup, loading, error };
}
