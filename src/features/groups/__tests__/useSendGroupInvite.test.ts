import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { useSendGroupInvite } from '../hooks/useSendGroupInvite';
import { ServiceContext } from '../../../core/di/ServiceContext';
import { createTestContainer } from '../../../core/di/testContainer';
import { GROUP_REPO, SHARE, TRIP_STORE } from '../../../core/di/tokens';
import { err } from '../../../core/types/Result';
import { groupFactory, groupMemberFactory } from '../../../__testUtils__/factories';
import type { ServiceContainer } from '../../../core/di/ServiceContainer';
import type { MockShareService } from '../../../__mocks__/MockShareService';

function makeWrapper(container: ServiceContainer) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(ServiceContext.Provider, { value: container }, children);
  };
}

describe('useSendGroupInvite', () => {
  it('saves the email and shares the group invite link when the guest has no email yet', async () => {
    const container = createTestContainer();
    const guest = groupMemberFactory({ userId: 'guest_1', groupId: 'g1', displayName: 'Jay', isGuest: true });
    const group = groupFactory({ id: 'g1', name: 'Roomies', inviteToken: 'tok_abc', members: [guest] });
    await container.resolve(GROUP_REPO).saveGroup(group);

    const { result } = renderHook(() => useSendGroupInvite(), { wrapper: makeWrapper(container) });

    let ok = false;
    await act(async () => { ok = await result.current.sendInvite(group, guest, 'jay@example.com'); });

    expect(ok).toBe(true);
    expect(result.current.error).toBeNull();

    const stored = await container.resolve(GROUP_REPO).getGroup('g1');
    if (stored.ok) expect(stored.value.members[0].email).toBe('jay@example.com');

    const share = container.resolve(SHARE) as MockShareService;
    expect(share.groupCalls).toEqual([{ groupId: 'g1', groupName: 'Roomies', inviteToken: 'tok_abc' }]);
  });

  it('reflects the new email in the store', async () => {
    const container = createTestContainer();
    const guest = groupMemberFactory({ userId: 'guest_1', groupId: 'g1', displayName: 'Jay', isGuest: true });
    const group = groupFactory({ id: 'g1', name: 'Roomies', inviteToken: 'tok_abc', members: [guest] });
    await container.resolve(GROUP_REPO).saveGroup(group);
    container.resolve(TRIP_STORE).getState().appendGroup(group);

    const { result } = renderHook(() => useSendGroupInvite(), { wrapper: makeWrapper(container) });
    await act(async () => { await result.current.sendInvite(group, guest, 'jay@example.com'); });

    const storeGroup = container.resolve(TRIP_STORE).getState().groups.find(g => g.id === 'g1');
    expect(storeGroup?.members[0].email).toBe('jay@example.com');
  });

  it('skips the repo write and just shares the link when the email is unchanged', async () => {
    const container = createTestContainer();
    const guest = groupMemberFactory({ userId: 'guest_1', groupId: 'g1', displayName: 'Jay', isGuest: true, email: 'jay@example.com' });
    const group = groupFactory({ id: 'g1', name: 'Roomies', inviteToken: 'tok_abc', members: [guest] });
    await container.resolve(GROUP_REPO).saveGroup(group);
    const repo = container.resolve(GROUP_REPO);
    const spy = jest.spyOn(repo, 'updateMemberEmail');

    const { result } = renderHook(() => useSendGroupInvite(), { wrapper: makeWrapper(container) });

    let ok = false;
    await act(async () => { ok = await result.current.sendInvite(group, guest, 'jay@example.com'); });

    expect(ok).toBe(true);
    expect(spy).not.toHaveBeenCalled();
    const share = container.resolve(SHARE) as MockShareService;
    expect(share.groupCalls).toHaveLength(1);
  });

  it('returns false and surfaces the error when saving the email fails', async () => {
    const container = createTestContainer();
    const guest = groupMemberFactory({ userId: 'guest_1', groupId: 'g1', displayName: 'Jay', isGuest: true });
    const group = groupFactory({ id: 'g1', name: 'Roomies', inviteToken: 'tok_abc', members: [guest] });
    await container.resolve(GROUP_REPO).saveGroup(group);
    const repo = container.resolve(GROUP_REPO);
    jest.spyOn(repo, 'updateMemberEmail').mockResolvedValue(err({ kind: 'NetworkError', message: 'boom' }));

    const { result } = renderHook(() => useSendGroupInvite(), { wrapper: makeWrapper(container) });

    let ok = true;
    await act(async () => { ok = await result.current.sendInvite(group, guest, 'jay@example.com'); });

    expect(ok).toBe(false);
    expect(result.current.error).toMatchObject({ kind: 'NetworkError' });

    const share = container.resolve(SHARE) as MockShareService;
    expect(share.groupCalls).toHaveLength(0);
  });
});
