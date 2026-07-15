import React from 'react';
import { screen, fireEvent } from '@testing-library/react-native';

jest.mock('expo-linking', () => ({
  createURL: (path: string) => `weshare://localhost${path}`,
}));

import { mockExpoRouterModule, mockVectorIconsModule } from '../../../__testUtils__/standardMocks';

jest.mock('@expo/vector-icons', () => mockVectorIconsModule());
jest.mock('expo-router', () => mockExpoRouterModule());
jest.mock('../../trips/hooks/useTripDetail', () => ({ useTripDetail: jest.fn() }));

import { InviteScreen } from '../screens/InviteScreen';
import { useTripDetail } from '../../trips/hooks/useTripDetail';
import { renderScreen } from '../../../__testUtils__/renderScreen';
import { createTestContainer } from '../../../core/di/testContainer';
import { SHARE } from '../../../core/di/tokens';
import { tripFactory } from '../../../__testUtils__/factories';

const mockUseTripDetail = useTripDetail as jest.Mock;

describe('InviteScreen', () => {
  it('renders the invite link derived from the trip\'s invite token', () => {
    mockUseTripDetail.mockReturnValue({
      trip: tripFactory({ name: 'Ski Trip', inviteToken: 'ABC12345' }),
      loading: false,
    });

    renderScreen(<InviteScreen />, createTestContainer());

    expect(screen.getByText('weshare://localhost/join/ABC12345')).toBeTruthy();
  });

  it('pressing Share invite calls the share service with the trip\'s invite token', () => {
    const container = createTestContainer();
    const trip = tripFactory({ id: 't1', name: 'Ski Trip', inviteToken: 'ABC12345' });
    mockUseTripDetail.mockReturnValue({ trip, loading: false });

    const share = container.resolve(SHARE);
    const shareSpy = jest.spyOn(share, 'shareTrip');

    renderScreen(<InviteScreen />, container);
    fireEvent.press(screen.getByText('Share invite'));

    expect(shareSpy).toHaveBeenCalledWith('t1', 'Ski Trip', 'ABC12345');
  });

  it('shows a warning instead of a link when the trip has no invite token yet', () => {
    mockUseTripDetail.mockReturnValue({
      trip: tripFactory({ name: 'Ski Trip', inviteToken: undefined }),
      loading: false,
    });

    renderScreen(<InviteScreen />, createTestContainer());

    expect(screen.queryByText('Share invite')).toBeNull();
    expect(screen.getByText(/No invite link yet/)).toBeTruthy();
  });
});
