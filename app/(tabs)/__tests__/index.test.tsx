import React from 'react';
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
import { tripFactory, groupFactory, groupMemberFactory } from '../../../src/__testUtils__/factories';

const mockUseTrips  = useTrips as jest.Mock;
const mockUseGroups = useGroups as jest.Mock;

function setup(opts: { trips?: ReturnType<typeof tripFactory>[]; groups?: ReturnType<typeof groupFactory>[] } = {}) {
  mockUseTrips.mockReturnValue({ trips: opts.trips ?? [], loading: false, refetch: jest.fn() });
  mockUseGroups.mockReturnValue({
    groups: opts.groups ?? [], groupTripCounts: {}, groupSummaries: {}, loading: false, refetch: jest.fn(),
  });
}

function render() {
  return renderScreen(<HomeScreen />, createTestContainer());
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
});
