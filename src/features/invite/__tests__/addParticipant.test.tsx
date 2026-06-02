/**
 * Tests for AddParticipantScreen — manual add, contacts flow, invite link.
 *
 * expo-contacts is mocked via moduleNameMapper → src/__mocks__/expo-contacts.ts
 */

jest.mock('expo-linking', () => ({
  createURL: (path: string) => `ouishare://localhost${path}`,
}));

jest.mock('react-native/Libraries/Components/Clipboard/Clipboard', () => ({
  setString: jest.fn(),
}));

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import * as ExpoContacts from 'expo-contacts';
import { AddParticipantScreen } from '../screens/AddParticipantScreen';
import { ServiceContext } from '../../../core/di/ServiceContext';
import { createTestContainer } from '../../../core/di/testContainer';
import { TRIP_REPO, MEMBER_REPO } from '../../../core/di/tokens';
import { InMemoryMemberRepository } from '../../../__mocks__/InMemoryMemberRepository';
import type { ServiceContainer } from '../../../core/di/ServiceContainer';
import type { Trip } from '../../../core/models/Trip';
import type { TripMember } from '../../../core/models/TripMember';
import { tripFactory, memberFactory } from '../../../__testUtils__/factories';

// ── Expo Router mocks ─────────────────────────────────────────────────────────

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: View,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ tripId: 't1' }),
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useFocusEffect: (cb: Parameters<typeof import('react').useEffect>[0]) => {
    const { useEffect } = require('react');
    useEffect(cb, []);
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const NOW = new Date('2025-06-01T12:00:00Z');

function makeWrapper(container: ServiceContainer) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(ServiceContext.Provider, { value: container }, children);
  };
}

async function renderScreen(container: ServiceContainer) {
  const utils = render(
    React.createElement(AddParticipantScreen),
    { wrapper: makeWrapper(container) },
  );
  // findByText retries until the text appears (loading state resolves)
  await utils.findByText(/Add Participants/i);
  return utils;
}

// ── Section A: Manual add ─────────────────────────────────────────────────────

describe('AddParticipantScreen — manual add', () => {
  it('renders the name input and Add button', async () => {
    const container = createTestContainer();
    await container.resolve(TRIP_REPO).saveTrip(tripFactory());

    const { getByPlaceholderText, getByText } = await renderScreen(container);

    expect(getByPlaceholderText('Enter a name')).toBeTruthy();
    expect(getByText('Add')).toBeTruthy();
  });

  it('calls addMember and appendMember with the entered name', async () => {
    const memberRepo = new InMemoryMemberRepository();
    const addSpy = jest.spyOn(memberRepo, 'addMember');

    const container = createTestContainer({ memberRepo });
    await container.resolve(TRIP_REPO).saveTrip(tripFactory());

    const { getByPlaceholderText, getByText } = await renderScreen(container);

    fireEvent.changeText(getByPlaceholderText('Enter a name'), 'Sophie');
    await act(async () => { fireEvent.press(getByText('Add')); });

    await waitFor(() => {
      expect(addSpy).toHaveBeenCalledWith(
        expect.objectContaining({ displayName: 'Sophie', isGuest: true, tripId: 't1' }),
      );
    });
  });

  it('clears the input after a successful add', async () => {
    const container = createTestContainer();
    await container.resolve(TRIP_REPO).saveTrip(tripFactory());

    const { getByPlaceholderText, getByText } = await renderScreen(container);
    const input = getByPlaceholderText('Enter a name');

    fireEvent.changeText(input, 'Sophie');
    await act(async () => { fireEvent.press(getByText('Add')); });

    await waitFor(() => expect(input.props.value).toBe(''));
  });

  it('shows "Already in this trip" when name matches an existing member', async () => {
    const memberRepo = new InMemoryMemberRepository().seed([memberFactory({ displayName: 'Jay' })]);
    const container  = createTestContainer({ memberRepo });
    const trip       = tripFactory({ members: [memberFactory({ displayName: 'Jay' })] });
    await container.resolve(TRIP_REPO).saveTrip(trip);

    const { getByPlaceholderText, findByText } = await renderScreen(container);

    fireEvent.changeText(getByPlaceholderText('Enter a name'), 'Jay');
    await expect(findByText('Already in this trip')).resolves.toBeTruthy();
  });
});

// ── Section B: Contacts ───────────────────────────────────────────────────────

describe('AddParticipantScreen — contacts (granted)', () => {
  it('renders the fixture contacts after permission is granted', async () => {
    const container = createTestContainer();
    await container.resolve(TRIP_REPO).saveTrip(tripFactory());

    const { findByLabelText, findByText } = await renderScreen(container);

    const toggleBtn = await findByLabelText('Add from contacts');
    await act(async () => { fireEvent.press(toggleBtn); });

    await expect(findByText('Alice Martin')).resolves.toBeTruthy();
    await expect(findByText('Bob Dupont')).resolves.toBeTruthy();
    await expect(findByText('Claire Moreau')).resolves.toBeTruthy();
  });

  it('calls addMember with phone and email when a contact is tapped', async () => {
    const memberRepo = new InMemoryMemberRepository();
    const addSpy = jest.spyOn(memberRepo, 'addMember');

    const container = createTestContainer({ memberRepo });
    await container.resolve(TRIP_REPO).saveTrip(tripFactory());

    const { findByLabelText, findByText } = await renderScreen(container);

    const toggleBtn = await findByLabelText('Add from contacts');
    await act(async () => { fireEvent.press(toggleBtn); });

    const row = await findByText('Alice Martin');
    await act(async () => { fireEvent.press(row); });

    await waitFor(() => {
      expect(addSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          displayName: 'Alice Martin',
          phone:       '+33612345678',
          email:       'alice@example.com',
          isGuest:     true,
        }),
      );
    });
  });

  it('shows checkmark after a contact is added', async () => {
    const container = createTestContainer();
    await container.resolve(TRIP_REPO).saveTrip(tripFactory());

    const { findByLabelText, findByText } = await renderScreen(container);

    const toggleBtn = await findByLabelText('Add from contacts');
    await act(async () => { fireEvent.press(toggleBtn); });

    const row = await findByText('Bob Dupont');
    await act(async () => { fireEvent.press(row); });

    await waitFor(async () => {
      const btn = await findByLabelText('Bob Dupont already added');
      expect(btn).toBeTruthy();
    });
  });

  it('filters contacts by search query', async () => {
    const container = createTestContainer();
    await container.resolve(TRIP_REPO).saveTrip(tripFactory());

    const { findByLabelText, findByPlaceholderText, queryByText, findByText } = await renderScreen(container);

    const toggleBtn = await findByLabelText('Add from contacts');
    await act(async () => { fireEvent.press(toggleBtn); });

    await findByText('Alice Martin'); // wait for contacts to load

    const searchInput = await findByPlaceholderText('Search contacts');
    fireEvent.changeText(searchInput, 'Bob');

    await waitFor(() => {
      expect(queryByText('Alice Martin')).toBeNull();
      expect(queryByText('Bob Dupont')).not.toBeNull();
    });
  });
});

describe('AddParticipantScreen — contacts (denied)', () => {
  beforeEach(() => {
    (ExpoContacts.requestPermissionsAsync as jest.Mock).mockResolvedValueOnce({
      status: 'denied',
      granted: false,
      canAskAgain: false,
      expires: 'never',
    });
  });

  it('shows the settings prompt and no contact list', async () => {
    const container = createTestContainer();
    await container.resolve(TRIP_REPO).saveTrip(tripFactory());

    const { findByLabelText, findByText, queryByText } = await renderScreen(container);

    const toggleBtn = await findByLabelText('Add from contacts');
    await act(async () => { fireEvent.press(toggleBtn); });

    await expect(findByText(/Enable contacts in Settings/i)).resolves.toBeTruthy();
    expect(queryByText('Alice Martin')).toBeNull();
  });
});

// ── Section C: Invite link ────────────────────────────────────────────────────

describe('AddParticipantScreen — invite link', () => {
  it('renders the invite URL after expanding the share panel', async () => {
    const container = createTestContainer();
    await container.resolve(TRIP_REPO).saveTrip(tripFactory({ inviteToken: 'TESTTOKEN' }));

    const { findByLabelText, findByText } = await renderScreen(container);

    const shareBtn = await findByLabelText('Share invite');
    await act(async () => { fireEvent.press(shareBtn); });

    await expect(findByText(/TESTTOKEN/)).resolves.toBeTruthy();
  });

  it('does not render invite button when trip has no token', async () => {
    const container = createTestContainer();
    await container.resolve(TRIP_REPO).saveTrip(tripFactory({ inviteToken: undefined }));

    const { queryByLabelText } = await renderScreen(container);

    expect(queryByLabelText('Share invite')).toBeNull();
  });
});
