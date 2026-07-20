import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { mockExpoRouterModule, mockVectorIconsModule } from '../../../src/__testUtils__/standardMocks';

jest.mock('@expo/vector-icons', () => mockVectorIconsModule());
jest.mock('expo-router', () => mockExpoRouterModule());

import CreateGroupScreen from '../create';
import { useRouter } from 'expo-router';
import { renderScreen } from '../../../src/__testUtils__/renderScreen';
import { createTestContainer } from '../../../src/core/di/testContainer';
import { AUTH, GROUP_REPO, TRIP_STORE } from '../../../src/core/di/tokens';
import { MockEntitlementService } from '../../../src/__mocks__/MockEntitlementService';

function render(container = createTestContainer()) {
  return renderScreen(<CreateGroupScreen />, container);
}

describe('CreateGroupScreen', () => {
  it('does not create a group when the name is left empty', async () => {
    const container = createTestContainer();
    await container.resolve(AUTH).signIn('jay@example.com', 'password');
    render(container);

    fireEvent(screen.getByLabelText('Group name input'), 'submitEditing');

    const groups = await container.resolve(GROUP_REPO).getGroupsForUser(
      (await container.resolve(AUTH).currentUser())!.id,
    );
    expect(groups.ok && groups.value).toHaveLength(0);
  });

  it('creates a group with a manually-added member and navigates to its detail screen', async () => {
    const container = createTestContainer();
    await container.resolve(AUTH).signIn('jay@example.com', 'password');
    render(container);

    fireEvent.changeText(screen.getByLabelText('Group name input'), 'Roomies');

    const memberField = screen.getByLabelText('Enter a name');
    fireEvent.changeText(memberField, 'Sam');
    fireEvent(memberField, 'submitEditing');
    expect(screen.getByText('Sam')).toBeTruthy();

    fireEvent(screen.getByLabelText('Group name input'), 'submitEditing');

    await waitFor(() => {
      const store = container.resolve(TRIP_STORE);
      expect(store.getState().groups).toHaveLength(1);
    });

    const store = container.resolve(TRIP_STORE);
    const saved = store.getState().groups[0];
    expect(saved.name).toBe('Roomies');
    expect(saved.members.some(m => m.displayName === 'Sam' && m.isGuest)).toBe(true);

    const router = useRouter();
    expect(router.replace).toHaveBeenCalledWith(`/group/${saved.id}`);
  });

  it('shows the paywall instead of creating a second group once the free-tier count cap is hit', async () => {
    const entitlement = new MockEntitlementService();
    entitlement.setActiveGroupCount(1);
    const container = createTestContainer({ entitlementService: entitlement });
    await container.resolve(AUTH).signIn('jay@example.com', 'password');
    render(container);

    fireEvent.changeText(screen.getByLabelText('Group name input'), 'Second Group');
    fireEvent(screen.getByLabelText('Group name input'), 'submitEditing');

    await waitFor(() => expect(screen.getByTestId('paywall-premium-card')).toBeTruthy());
    expect(container.resolve(TRIP_STORE).getState().groups).toHaveLength(0);
  });
});
