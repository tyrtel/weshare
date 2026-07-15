import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { mockExpoRouterModule, mockVectorIconsModule } from '../../../src/__testUtils__/standardMocks';

const mockBack = jest.fn();
jest.mock('@expo/vector-icons', () => mockVectorIconsModule());
jest.mock('expo-router', () => {
  const base = mockExpoRouterModule();
  return { ...base, useRouter: () => ({ ...base.useRouter(), back: mockBack }) };
});

import EditGroupScreen from '../edit';
import { useLocalSearchParams } from 'expo-router';
import { renderScreen } from '../../../src/__testUtils__/renderScreen';
import { createTestContainer } from '../../../src/core/di/testContainer';
import { GROUP_REPO, TRIP_STORE } from '../../../src/core/di/tokens';
import { groupFactory, groupMemberFactory } from '../../../src/__testUtils__/factories';

const mockParams = useLocalSearchParams as jest.Mock;

async function seed(container = createTestContainer()) {
  const members = [
    groupMemberFactory({ userId: 'owner1', groupId: 'g1', displayName: 'Alice' }),
    groupMemberFactory({ userId: 'guest1', groupId: 'g1', displayName: 'Sam', isGuest: true }),
  ];
  const group = groupFactory({ id: 'g1', name: 'Roomies', currency: 'EUR', ownerId: 'owner1', members });
  await container.resolve(GROUP_REPO).saveGroup(group);
  container.resolve(TRIP_STORE).getState().appendGroup(group);
  mockParams.mockReturnValue({ id: 'g1' });
  return { container, group };
}

describe('EditGroupScreen', () => {
  it('pre-fills the group name/currency and shows owner/guest labels', async () => {
    const { container } = await seed();
    renderScreen(<EditGroupScreen />, container);

    expect(screen.getByLabelText('Group name input').props.value).toBe('Roomies');
    expect(screen.getByText('€ EUR')).toBeTruthy();
    expect(screen.getByText('Owner')).toBeTruthy();
    expect(screen.getByText('Guest')).toBeTruthy();
  });

  it('saves a name change and navigates back', async () => {
    const { container } = await seed();
    renderScreen(<EditGroupScreen />, container);

    const nameField = screen.getByLabelText('Group name input');
    fireEvent.changeText(nameField, 'Roomies (updated)');
    fireEvent(nameField, 'submitEditing');

    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));

    const stored = await container.resolve(GROUP_REPO).getGroup('g1');
    expect(stored.ok && stored.value.name).toBe('Roomies (updated)');
  });
});
