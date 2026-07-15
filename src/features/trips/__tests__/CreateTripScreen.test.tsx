import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { mockExpoRouterModule, mockVectorIconsModule } from '../../../__testUtils__/standardMocks';

jest.mock('@expo/vector-icons', () => mockVectorIconsModule());
jest.mock('expo-router', () => mockExpoRouterModule());

import { CreateTripScreen } from '../screens/CreateTripScreen';
import { useLocalSearchParams } from 'expo-router';
import { renderScreen } from '../../../__testUtils__/renderScreen';
import { createTestContainer } from '../../../core/di/testContainer';
import { AUTH, TRIP_REPO, TRIP_STORE } from '../../../core/di/tokens';
import { groupFactory, groupMemberFactory } from '../../../__testUtils__/factories';

const mockParams = useLocalSearchParams as jest.Mock;

beforeEach(() => {
  mockParams.mockReturnValue({});
});

describe('CreateTripScreen', () => {
  it('creates a trip and routes to add-participant when launched standalone', async () => {
    const container = createTestContainer();
    await container.resolve(AUTH).signIn('jay@example.com', 'password');

    renderScreen(<CreateTripScreen />, container);

    const nameField = screen.getByLabelText('Trip name');
    fireEvent.changeText(nameField, 'Ski Trip');
    fireEvent(nameField, 'submitEditing');

    await waitFor(async () => {
      const repo = container.resolve(TRIP_REPO);
      const trips = await repo.getTripsForUser((await container.resolve(AUTH).currentUser())!.id);
      expect(trips.ok && trips.value).toHaveLength(1);
    });

    const store = container.resolve(TRIP_STORE);
    const savedTrip = store.getState().trips[0];
    expect(savedTrip.name).toBe('Ski Trip');
    expect(savedTrip.groupId).toBeUndefined();
  });

  it('shows a member picker (not an immediate save) when launched from a group', async () => {
    const container = createTestContainer();
    await container.resolve(AUTH).signIn('jay@example.com', 'password');

    const members = [
      groupMemberFactory({ userId: 'gu1', groupId: 'g1', displayName: 'Dee' }),
      groupMemberFactory({ userId: 'gu2', groupId: 'g1', displayName: 'Eli' }),
    ];
    container.resolve(TRIP_STORE).getState().appendGroup(groupFactory({ id: 'g1', currency: 'USD', members }));
    mockParams.mockReturnValue({ groupId: 'g1' });

    renderScreen(<CreateTripScreen />, container);

    const nameField = screen.getByLabelText('Trip name');
    fireEvent.changeText(nameField, 'Roomies Weekend');
    fireEvent(nameField, 'submitEditing');

    // Switches to the member-picker step instead of saving immediately.
    expect(await screen.findByText('Select members')).toBeTruthy();
    expect(screen.getByText('Dee')).toBeTruthy();
    expect(screen.getByText('Eli')).toBeTruthy();

    // Both group members are pre-selected; confirming saves the trip with them.
    fireEvent.press(screen.getByLabelText('Done'));

    await waitFor(async () => {
      const store = container.resolve(TRIP_STORE);
      expect(store.getState().trips).toHaveLength(1);
    });

    const saved = container.resolve(TRIP_STORE).getState().trips[0];
    expect(saved.groupId).toBe('g1');
    expect(saved.currency).toBe('USD');
    expect(saved.members.map(m => m.userId)).toEqual(expect.arrayContaining(['gu1', 'gu2']));
  });
});
