import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { mockExpoRouterModule, mockVectorIconsModule } from '../../../__testUtils__/standardMocks';

const mockReplace = jest.fn();
jest.mock('@expo/vector-icons', () => mockVectorIconsModule());
jest.mock('expo-router', () => {
  const base = mockExpoRouterModule();
  return { ...base, useRouter: () => ({ ...base.useRouter(), replace: mockReplace }) };
});
jest.mock('../hooks/useJoinTrip', () => ({ useJoinTrip: jest.fn() }));

import { JoinScreen } from '../screens/JoinScreen';
import { useJoinTrip } from '../hooks/useJoinTrip';
import { renderScreen } from '../../../__testUtils__/renderScreen';
import { createTestContainer } from '../../../core/di/testContainer';
import { AUTH } from '../../../core/di/tokens';
import { tripFactory } from '../../../__testUtils__/factories';

const mockUseJoinTrip = useJoinTrip as jest.Mock;

beforeEach(() => {
  mockReplace.mockClear();
});

describe('JoinScreen', () => {
  it('shows an error state instead of crashing for an invalid/expired token', () => {
    mockUseJoinTrip.mockReturnValue({
      trip: null, loading: false, error: { kind: 'NotFoundError', resource: 'Trip', id: 'bad-token' },
      joining: false, joinError: null, joinAuthenticated: jest.fn(),
    });

    renderScreen(<JoinScreen />, createTestContainer());

    expect(screen.getByText('Invite not found')).toBeTruthy();
    expect(screen.getByText('Go home')).toBeTruthy();
  });

  it('prompts sign-in when the user is not authenticated', () => {
    mockUseJoinTrip.mockReturnValue({
      trip: tripFactory({ name: 'Ski Trip' }), loading: false, error: null,
      joining: false, joinError: null, joinAuthenticated: jest.fn(),
    });

    renderScreen(<JoinScreen />, createTestContainer());

    expect(screen.getByText('Sign in to join')).toBeTruthy();
  });

  it('joins and navigates to the trip for a valid token when signed in', async () => {
    const container = createTestContainer();
    await container.resolve(AUTH).signIn('jay@example.com', 'password');

    const trip = tripFactory({ id: 't1', name: 'Ski Trip' });
    const joinAuthenticated = jest.fn().mockResolvedValue(trip);
    mockUseJoinTrip.mockReturnValue({
      trip, loading: false, error: null, joining: false, joinError: null, joinAuthenticated,
    });

    renderScreen(<JoinScreen />, container);

    fireEvent.press(screen.getByText('Join Ski Trip'));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/trip/t1'));
  });
});
