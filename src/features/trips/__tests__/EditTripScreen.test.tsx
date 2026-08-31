import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { mockExpoRouterModule, mockVectorIconsModule } from '../../../__testUtils__/standardMocks';

jest.mock('@expo/vector-icons', () => mockVectorIconsModule());
jest.mock('expo-router', () => mockExpoRouterModule());
jest.mock('../hooks/useTripDetail', () => ({ useTripDetail: jest.fn() }));
jest.mock('../../../core/utils/confirm', () => ({ confirm: jest.fn(() => Promise.resolve(false)) }));

import { EditTripScreen } from '../screens/EditTripScreen';
import { useTripDetail } from '../hooks/useTripDetail';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { confirm } from '../../../core/utils/confirm';
import { renderScreen } from '../../../__testUtils__/renderScreen';
import { createTestContainer } from '../../../core/di/testContainer';
import { TRIP_REPO, TRIP_STORE, AUTH } from '../../../core/di/tokens';
import { tripFactory } from '../../../__testUtils__/factories';

const mockUseTripDetail = useTripDetail as jest.Mock;
const mockParams        = useLocalSearchParams as jest.Mock;
const mockConfirm       = confirm as jest.Mock;

const OWNER_EMAIL = 'owner@example.com';

beforeEach(() => {
  mockParams.mockReturnValue({ id: 't1' });
});

describe('EditTripScreen', () => {
  it('pre-fills the existing trip name and currency', () => {
    mockUseTripDetail.mockReturnValue({
      trip: tripFactory({ id: 't1', name: 'Chez Paul', currency: 'GBP', status: 'active' }),
      loading: false,
    });

    renderScreen(<EditTripScreen />, createTestContainer());

    expect(screen.getByLabelText('Trip name').props.value).toBe('Chez Paul');
    expect(screen.getByText('£ GBP')).toBeTruthy();
  });

  it('saves a name change and persists it via the repo', async () => {
    const container = createTestContainer();
    const trip = tripFactory({ id: 't1', name: 'Chez Paul', currency: 'EUR', status: 'active' });
    await container.resolve(TRIP_REPO).saveTrip(trip);
    container.resolve(TRIP_STORE).getState().appendTrip(trip);
    mockUseTripDetail.mockReturnValue({ trip, loading: false });

    renderScreen(<EditTripScreen />, container);

    fireEvent.changeText(screen.getByLabelText('Trip name'), 'Chez Paul (updated)');
    fireEvent.press(screen.getByText('Save changes'));

    await waitFor(async () => {
      const stored = await container.resolve(TRIP_REPO).getTrip('t1');
      expect(stored.ok && stored.value.name).toBe('Chez Paul (updated)');
    });
  });

  it('replaces the form with a read-only message when the trip is closed', () => {
    mockUseTripDetail.mockReturnValue({
      trip: tripFactory({ id: 't1', name: 'Chez Paul', currency: 'EUR', status: 'closed' }),
      loading: false,
    });

    renderScreen(<EditTripScreen />, createTestContainer());

    expect(screen.queryByLabelText('Trip name')).toBeNull();
    expect(screen.getByText('This trip is closed and can no longer be edited.')).toBeTruthy();
  });

  describe('delete trip', () => {
    async function seedOwner(container: ReturnType<typeof createTestContainer>) {
      await container.resolve(AUTH).signIn(OWNER_EMAIL, 'password');
      return `user_${OWNER_EMAIL}`;
    }

    it('does not show a delete option to a non-owner', () => {
      mockUseTripDetail.mockReturnValue({
        trip: tripFactory({ id: 't1', name: 'Chez Paul', currency: 'EUR', status: 'active', ownerId: 'someone-else' }),
        loading: false,
      });

      renderScreen(<EditTripScreen />, createTestContainer());

      expect(screen.queryByText('Delete')).toBeNull();
    });

    it('shows a delete option to the trip owner, even when the trip is closed', async () => {
      const container = createTestContainer();
      const ownerId = await seedOwner(container);
      mockUseTripDetail.mockReturnValue({
        trip: tripFactory({ id: 't1', name: 'Chez Paul', currency: 'EUR', status: 'closed', ownerId }),
        loading: false,
      });

      renderScreen(<EditTripScreen />, container);

      expect(screen.getByText('Delete')).toBeTruthy();
    });

    it('deletes the trip and navigates to the home tab on confirm', async () => {
      const container = createTestContainer();
      const ownerId = await seedOwner(container);
      const trip = tripFactory({ id: 't1', name: 'Chez Paul', currency: 'EUR', status: 'active', ownerId });
      await container.resolve(TRIP_REPO).saveTrip(trip);
      container.resolve(TRIP_STORE).getState().appendTrip(trip);
      mockUseTripDetail.mockReturnValue({ trip, loading: false });
      mockConfirm.mockResolvedValue(true);

      renderScreen(<EditTripScreen />, container);
      fireEvent.press(screen.getByText('Delete'));

      await waitFor(async () => {
        const stored = await container.resolve(TRIP_REPO).getTrip('t1');
        expect(stored.ok).toBe(false);
      });
      const router = useRouter();
      expect(router.replace).toHaveBeenCalledWith('/(tabs)');
    });

    it('does not delete the trip when the confirmation is cancelled', async () => {
      const container = createTestContainer();
      const ownerId = await seedOwner(container);
      const trip = tripFactory({ id: 't1', name: 'Chez Paul', currency: 'EUR', status: 'active', ownerId });
      await container.resolve(TRIP_REPO).saveTrip(trip);
      container.resolve(TRIP_STORE).getState().appendTrip(trip);
      mockUseTripDetail.mockReturnValue({ trip, loading: false });
      mockConfirm.mockResolvedValue(false);

      renderScreen(<EditTripScreen />, container);
      fireEvent.press(screen.getByText('Delete'));

      await Promise.resolve();
      const stored = await container.resolve(TRIP_REPO).getTrip('t1');
      expect(stored.ok).toBe(true);
    });
  });
});
