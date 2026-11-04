import { useState, useCallback } from 'react';
import { useService } from '../../../core/di/ServiceContext';
import { GROUP_REPO, TRIP_STORE } from '../../../core/di/tokens';
import { isOk } from '../../../core/types/Result';
import type { Result } from '../../../core/types/Result';
import type { Group } from '../../../core/models/Group';
import type { AppError } from '../../../core/types/AppError';

// Owner actions on a group's invite link: change its lifetime, or reset it.
export function useGroupInviteLink(groupId: string) {
  const groupRepo = useService(GROUP_REPO);
  const storeApi = useService(TRIP_STORE);

  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  const apply = useCallback(async (action: () => Promise<Result<Group, AppError>>): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      if (!isOk(result)) {
        setError(result.error);
        return false;
      }
      storeApi.getState().updateGroupInStore(result.value);
      return true;
    } catch (e) {
      setError({ kind: 'NetworkError', message: e instanceof Error ? e.message : 'Unexpected error' });
      return false;
    } finally {
      setBusy(false);
    }
  }, [storeApi]);

  const setTtl = useCallback(
    (ttlHours: number | null) => apply(() => groupRepo.setInviteTtl(groupId, ttlHours)),
    [apply, groupRepo, groupId],
  );
  const reset = useCallback(() => apply(() => groupRepo.resetInvite(groupId)), [apply, groupRepo, groupId]);

  return { setTtl, reset, busy, error };
}
