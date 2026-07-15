import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { mockExpoRouterModule, mockVectorIconsModule } from '../../../src/__testUtils__/standardMocks';

const mockBack = jest.fn();
jest.mock('@expo/vector-icons', () => mockVectorIconsModule());
jest.mock('expo-router', () => {
  const base = mockExpoRouterModule();
  return { ...base, useRouter: () => ({ ...base.useRouter(), back: mockBack }) };
});
jest.mock('../../../src/features/groups/hooks/useGroupDetail', () => ({
  useGroupDetail: jest.fn(),
}));

import GroupAddMemberScreen from '../add-member';
import { useGroupDetail } from '../../../src/features/groups/hooks/useGroupDetail';
import { useLocalSearchParams } from 'expo-router';
import { renderScreen } from '../../../src/__testUtils__/renderScreen';
import { createTestContainer } from '../../../src/core/di/testContainer';
import { GROUP_REPO, SHARE } from '../../../src/core/di/tokens';
import { groupFactory, groupMemberFactory } from '../../../src/__testUtils__/factories';
import type { MockShareService } from '../../../src/__mocks__/MockShareService';

const mockUseGroupDetail = useGroupDetail as jest.Mock;
const mockParams         = useLocalSearchParams as jest.Mock;

const GROUP = groupFactory({
  id: 'g1', currency: 'EUR',
  members: [groupMemberFactory({ userId: 'u1', groupId: 'g1', displayName: 'Alice' })],
});

beforeEach(() => {
  mockParams.mockReturnValue({ groupId: 'g1' });
  mockBack.mockClear();
  mockUseGroupDetail.mockReturnValue({ group: GROUP });
});

describe('GroupAddMemberScreen', () => {
  it('adds a member manually and persists it via the group repo', async () => {
    const container = createTestContainer();
    // addMember requires the group to already exist in the repo, not just be
    // returned by the (mocked) useGroupDetail hook.
    await container.resolve(GROUP_REPO).saveGroup(GROUP);
    renderScreen(<GroupAddMemberScreen />, container);

    const field = screen.getByLabelText('Enter a name');
    fireEvent.changeText(field, 'Sam');
    fireEvent(field, 'submitEditing');

    await waitFor(() => expect(screen.getByText('Sam')).toBeTruthy());

    const stored = await container.resolve(GROUP_REPO).getGroup('g1');
    expect(stored.ok && stored.value.members.some(m => m.displayName === 'Sam' && m.isGuest)).toBe(true);
  });

  it('pressing Done navigates back', () => {
    renderScreen(<GroupAddMemberScreen />, createTestContainer());

    fireEvent.press(screen.getByLabelText('Done'));

    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  // Phase: guest-merge groups (TODO_userMerge.md Chunk A)
  it('shows a share-invite button when the group has an invite token, and calls shareGroup', () => {
    const withToken = groupFactory({ id: 'g1', inviteToken: 'tok_abc', members: GROUP.members });
    mockUseGroupDetail.mockReturnValue({ group: withToken });
    const container = createTestContainer();

    renderScreen(<GroupAddMemberScreen />, container);
    fireEvent.press(screen.getByText('Share invite link'));

    const share = container.resolve(SHARE) as MockShareService;
    expect(share.groupCalls).toEqual([{ groupId: 'g1', groupName: withToken.name, inviteToken: 'tok_abc' }]);
  });

  it('hides the share-invite button when the group has no invite token', () => {
    renderScreen(<GroupAddMemberScreen />, createTestContainer());
    expect(screen.queryByText('Share invite link')).toBeNull();
  });
});
