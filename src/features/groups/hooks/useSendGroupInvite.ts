import { useState, useCallback } from 'react';
import { useService } from '../../../core/di/ServiceContext';
import { GROUP_REPO, SHARE, TRIP_STORE } from '../../../core/di/tokens';
import { isOk } from '../../../core/types/Result';
import type { Group } from '../../../core/models/Group';
import type { GroupMember } from '../../../core/models/GroupMember';
import type { AppError } from '../../../core/types/AppError';

/**
 * Chunk C (TODO_userMerge.md) — "send an invite" to one specific unlinked
 * guest. There's no separate per-guest token: useJoinGroup already claims a
 * placeholder by matching the signed-in user's email against ANY group_members
 * row with that email, so "sending an invite" is just (a) making sure the
 * guest's email is saved, then (b) sharing the group's existing invite link.
 */
export function useSendGroupInvite() {
  const groupRepo = useService(GROUP_REPO);
  const share     = useService(SHARE);
  const storeApi  = useService(TRIP_STORE);

  const [sending, setSending] = useState(false);
  const [error,   setError]   = useState<AppError | null>(null);

  const sendInvite = useCallback(
    async (group: Group, member: GroupMember, email: string): Promise<boolean> => {
      setSending(true);
      setError(null);
      try {
        if (member.email !== email) {
          const result = await groupRepo.updateMemberEmail(group.id, member.userId, email);
          if (!isOk(result)) {
            setError(result.error);
            return false;
          }
          storeApi.getState().updateGroupMemberInStore(group.id, result.value);
        }
        await share.shareGroup(group.id, group.name, group.inviteToken ?? '');
        return true;
      } finally {
        setSending(false);
      }
    },
    [groupRepo, share, storeApi],
  );

  return { sendInvite, sending, error };
}
