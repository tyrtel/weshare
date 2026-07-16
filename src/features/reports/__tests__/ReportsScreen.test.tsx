import { mockVectorIconsModule, mockSvgModule, mockExpoRouterModule } from '../../../__testUtils__/standardMocks';

jest.mock('@expo/vector-icons', () => mockVectorIconsModule());
jest.mock('react-native-svg', () => mockSvgModule());
jest.mock('expo-router', () => mockExpoRouterModule());
jest.mock('expo-print', () => ({
  printToFileAsync: jest.fn(),
}));
jest.mock('expo-sharing', () => ({
  shareAsync: jest.fn(),
}));

import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { ReportsScreen } from '../screens/ReportsScreen';
import { renderScreen } from '../../../__testUtils__/renderScreen';
import { createTestContainer } from '../../../core/di/testContainer';
import { AUTH, TRIP_REPO, GROUP_REPO, TRIP_STORE, REPORT_SERVICE } from '../../../core/di/tokens';
import { MockReportService } from '../../../__mocks__/MockReportService';
import { tripFactory, groupFactory, groupMemberFactory, memberFactory } from '../../../__testUtils__/factories';
import type { ServiceContainer } from '../../../core/di/ServiceContainer';

// useTrips/useGroups both hide their lists entirely when no user is signed
// in (`user ? trips : []` / `user ? groups : []`), and once signed in, their
// own useFocusEffect fetches from TRIP_REPO/GROUP_REPO and overwrites
// whatever was appended directly to the store — so trips/groups must be
// seeded in the repo (not just via store.appendTrip/appendGroup), matching
// BalanceSummaryScreen.test.tsx's established pattern.
async function signedInContainerWith(trip?: ReturnType<typeof tripFactory>, group?: ReturnType<typeof groupFactory>): Promise<ServiceContainer> {
  const container = createTestContainer();
  const auth   = container.resolve(AUTH);
  const result = await auth.signIn('me@example.com', 'password');
  const userId = result.ok ? result.value.id : '';
  const store  = container.resolve(TRIP_STORE);

  if (trip) await container.resolve(TRIP_REPO).saveTrip({ ...trip, ownerId: userId });
  if (group) await container.resolve(GROUP_REPO).saveGroup({ ...group, ownerId: userId });

  await store.getState().loadTrips(userId);
  if (group) await store.getState().loadGroups(userId);
  return container;
}

function render(container: ServiceContainer = createTestContainer()) {
  return renderScreen(<ReportsScreen />, container);
}

beforeEach(() => {
  jest.clearAllMocks();
  const Print   = require('expo-print')   as { printToFileAsync: jest.Mock };
  const Sharing = require('expo-sharing') as { shareAsync: jest.Mock };
  Print.printToFileAsync.mockResolvedValue({ uri: '/tmp/report.pdf' });
  Sharing.shareAsync.mockResolvedValue(undefined);
});

describe('ReportsScreen', () => {
  it('shows empty states when there are no trips or groups', () => {
    render();
    expect(screen.getByText('No trips yet.')).toBeTruthy();
    expect(screen.getByText('No groups yet.')).toBeTruthy();
  });

  it('lists trips and groups', async () => {
    const container = await signedInContainerWith(
      tripFactory({ id: 't1', name: 'Amsterdam', members: [memberFactory()] }),
      groupFactory({ id: 'g1', name: 'Flatmates', members: [groupMemberFactory()] }),
    );

    render(container);

    expect(screen.getByText('Amsterdam')).toBeTruthy();
    expect(screen.getByText('Flatmates')).toBeTruthy();
  });

  it('generates and shares a PDF when Generate is pressed for a trip', async () => {
    const container = await signedInContainerWith(
      tripFactory({ id: 't1', name: 'Amsterdam', members: [memberFactory()] }),
    );

    render(container);
    fireEvent.press(screen.getByLabelText('Generate PDF report for Amsterdam'));

    await waitFor(() => {
      const Sharing = require('expo-sharing') as { shareAsync: jest.Mock };
      expect(Sharing.shareAsync).toHaveBeenCalledTimes(1);
    });
  });

  it('shows the rate-limit error and disables generation once the limit is reached', async () => {
    const container = await signedInContainerWith(
      tripFactory({ id: 't1', name: 'Amsterdam', members: [memberFactory()] }),
    );
    const reportService = container.resolve(REPORT_SERVICE) as MockReportService;
    reportService.callCount = reportService.maxCalls;

    render(container);
    fireEvent.press(screen.getByLabelText('Generate PDF report for Amsterdam'));

    await waitFor(() => {
      expect(screen.getByText(/reached today's limit of 5 reports/)).toBeTruthy();
    });
    const Print = require('expo-print') as { printToFileAsync: jest.Mock };
    expect(Print.printToFileAsync).not.toHaveBeenCalled();
  });

  it('shows the remaining count after a successful generation', async () => {
    const container = await signedInContainerWith(
      tripFactory({ id: 't1', name: 'Amsterdam', members: [memberFactory()] }),
    );

    render(container);
    fireEvent.press(screen.getByLabelText('Generate PDF report for Amsterdam'));

    await waitFor(() => {
      const Sharing = require('expo-sharing') as { shareAsync: jest.Mock };
      expect(Sharing.shareAsync).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText('4 reports remaining today')).toBeTruthy();
  });
});
