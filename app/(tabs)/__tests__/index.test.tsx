import React from 'react';
import { Alert } from 'react-native';
import { screen, fireEvent } from '@testing-library/react-native';
import { mockExpoRouterModule, mockVectorIconsModule, mockSafeAreaModule } from '../../../src/__testUtils__/standardMocks';

jest.mock('@expo/vector-icons', () => mockVectorIconsModule());
jest.mock('react-native-safe-area-context', () => mockSafeAreaModule());
jest.mock('expo-router', () => mockExpoRouterModule());
jest.mock('../../../src/features/trips/hooks/useTrips', () => ({ useTrips: jest.fn() }));
jest.mock('../../../src/features/groups/hooks/useGroups', () => ({ useGroups: jest.fn() }));

import HomeScreen from '../index';
import { useTrips } from '../../../src/features/trips/hooks/useTrips';
import { useGroups } from '../../../src/features/groups/hooks/useGroups';
import { useRouter } from 'expo-router';
import { renderScreen } from '../../../src/__testUtils__/renderScreen';
import { createTestContainer } from '../../../src/core/di/testContainer';
import { AUTH } from '../../../src/core/di/tokens';
import { tripFactory, groupFactory, groupMemberFactory } from '../../../src/__testUtils__/factories';
import type { ServiceContainer } from '../../../src/core/di/ServiceContainer';

const mockUseTrips  = useTrips as jest.Mock;
const mockUseGroups = useGroups as jest.Mock;

function setup(opts: { trips?: ReturnType<typeof tripFactory>[]; groups?: ReturnType<typeof groupFactory>[] } = {}) {
  mockUseTrips.mockReturnValue({ trips: opts.trips ?? [], summaries: {}, loading: false, refetch: jest.fn() });
  mockUseGroups.mockReturnValue({
    groups: opts.groups ?? [], groupTripCounts: {}, groupSummaries: {}, loading: false, refetch: jest.fn(),
  });
}

function render(container: ServiceContainer = createTestContainer()) {
  return renderScreen(<HomeScreen />, container);
}

describe('HomeScreen', () => {
  it('renders standalone trip cards and group cards together', () => {
    setup({
      trips: [tripFactory({ id: 't1', name: 'Ski Trip', groupId: undefined })],
      groups: [groupFactory({
        id: 'g1', name: 'Roomies',
        members: [groupMemberFactory({ userId: 'u1', groupId: 'g1' })],
      })],
    });

    render();

    expect(screen.getByText('Ski Trip')).toBeTruthy();
    expect(screen.getByText('Roomies')).toBeTruthy();
  });

  it('does not show a trip belonging to a group in the standalone trips section', () => {
    setup({
      trips: [tripFactory({ id: 't1', name: 'Group Sub-trip', groupId: 'g1' })],
      groups: [],
    });

    render();

    expect(screen.queryByText('Group Sub-trip')).toBeNull();
  });

  it('shows the groups empty state when the user has neither trips nor groups', () => {
    setup();

    render();

    expect(screen.getByText('No groups yet. Tap + to create one.')).toBeTruthy();
  });

  it('tapping a trip card navigates to its detail screen', () => {
    setup({ trips: [tripFactory({ id: 't1', name: 'Ski Trip', groupId: undefined })] });

    render();
    fireEvent.press(screen.getByText('Ski Trip'));

    const router = useRouter();
    expect(router.push).toHaveBeenCalledWith('/trip/t1');
  });

  it("shows the current user's owed/owe balance for a standalone trip", () => {
    mockUseTrips.mockReturnValue({
      trips: [tripFactory({ id: 't1', name: 'Ski Trip', groupId: undefined, currency: 'EUR' })],
      summaries: { t1: { direction: 'owed', amountCents: 1234 } },
      loading: false,
      refetch: jest.fn(),
    });
    mockUseGroups.mockReturnValue({ groups: [], groupTripCounts: {}, groupSummaries: {}, loading: false, refetch: jest.fn() });

    render();

    expect(screen.getAllByText('+€12.34').length).toBeGreaterThanOrEqual(1);
  });

  it('sums both trips and groups into the "Overall" hero line, not just groups', () => {
    mockUseTrips.mockReturnValue({
      trips: [tripFactory({ id: 't1', name: 'Ski Trip', groupId: undefined, currency: 'EUR' })],
      summaries: { t1: { direction: 'owed', amountCents: 20000 } },
      loading: false,
      refetch: jest.fn(),
    });
    mockUseGroups.mockReturnValue({
      groups: [groupFactory({ id: 'g1', name: 'Roomies', members: [groupMemberFactory({ userId: 'u1', groupId: 'g1' })] })],
      groupTripCounts: {},
      groupSummaries: { g1: { direction: 'owe', amountCents: 2100, currency: 'EUR' } },
      loading: false,
      refetch: jest.fn(),
    });

    render();

    // 200.00 owed minus 21.00 owed by me = net +179.00 ahead, not just the group's -21.00.
    expect(screen.getByText('Overall')).toBeTruthy();
    expect(screen.getByText('+€179.00')).toBeTruthy();
  });

  describe('profile menu', () => {
    it('opens a menu (not the FAB speed-dial) when the profile icon is pressed', () => {
      setup();
      render();

      fireEvent.press(screen.getByLabelText('Open menu'));

      expect(screen.getByText('Log out')).toBeTruthy();
      // The FAB's own speed-dial pills share this label text — confirm this
      // press didn't also toggle the unrelated bottom-right FAB.
      expect(screen.queryByLabelText('Open actions')).toBeNull();
    });

    it('navigates to new trip and closes the menu', () => {
      setup();
      render();

      fireEvent.press(screen.getByLabelText('Open menu'));
      fireEvent.press(screen.getByText('New trip'));

      const router = useRouter();
      expect(router.push).toHaveBeenCalledWith('/trip/create');
      expect(screen.queryByText('Log out')).toBeNull();
    });

    it('navigates to new group and closes the menu', () => {
      setup();
      render();

      fireEvent.press(screen.getByLabelText('Open menu'));
      fireEvent.press(screen.getByText('New group'));

      const router = useRouter();
      expect(router.push).toHaveBeenCalledWith('/group/create');
    });

    it('confirms before logging out, then signs out', async () => {
      setup();
      const container = createTestContainer();
      const signOutSpy = jest.spyOn(container.resolve(AUTH), 'signOut');
      jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
        buttons?.[1]?.onPress?.();
      });

      render(container);
      fireEvent.press(screen.getByLabelText('Open menu'));
      fireEvent.press(screen.getByText('Log out'));

      expect(Alert.alert).toHaveBeenCalled();
      expect(signOutSpy).toHaveBeenCalledTimes(1);
    });

    it('does not sign out if the confirmation is cancelled', () => {
      setup();
      const container = createTestContainer();
      const signOutSpy = jest.spyOn(container.resolve(AUTH), 'signOut');
      jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
        buttons?.[0]?.onPress?.();
      });

      render(container);
      fireEvent.press(screen.getByLabelText('Open menu'));
      fireEvent.press(screen.getByText('Log out'));

      expect(signOutSpy).not.toHaveBeenCalled();
    });
  });
});
