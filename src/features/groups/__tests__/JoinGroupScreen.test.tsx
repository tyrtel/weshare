import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { mockExpoRouterModule, mockVectorIconsModule } from '../../../__testUtils__/standardMocks';

const mockReplace = jest.fn();
jest.mock('@expo/vector-icons', () => mockVectorIconsModule());
jest.mock('expo-router', () => {
  const base = mockExpoRouterModule();
  return { ...base, useRouter: () => ({ ...base.useRouter(), replace: mockReplace }) };
});
jest.mock('../hooks/useJoinGroup', () => ({ useJoinGroup: jest.fn() }));

import { JoinGroupScreen } from '../screens/JoinGroupScreen';
import { useJoinGroup } from '../hooks/useJoinGroup';
import { renderScreen } from '../../../__testUtils__/renderScreen';
import { createTestContainer } from '../../../core/di/testContainer';
import { AUTH } from '../../../core/di/tokens';
import { groupFactory } from '../../../__testUtils__/factories';

const mockUseJoinGroup = useJoinGroup as jest.Mock;

beforeEach(() => {
  mockReplace.mockClear();
});

describe('JoinGroupScreen', () => {
  it('shows an error state instead of crashing for an invalid/expired token', () => {
    mockUseJoinGroup.mockReturnValue({
      group: null, loading: false, error: { kind: 'NotFoundError', resource: 'Group', id: 'bad-token' },
      joining: false, joinError: null, joinAuthenticated: jest.fn(),
    });

    renderScreen(<JoinGroupScreen />, createTestContainer());

    expect(screen.getByText('Invite not found')).toBeTruthy();
    expect(screen.getByText('Go home')).toBeTruthy();
  });

  it('prompts sign-in when the user is not authenticated', () => {
    mockUseJoinGroup.mockReturnValue({
      group: groupFactory({ name: 'Roomies' }), loading: false, error: null,
      joining: false, joinError: null, joinAuthenticated: jest.fn(),
    });

    renderScreen(<JoinGroupScreen />, createTestContainer());

    expect(screen.getByText('Sign in to join')).toBeTruthy();
  });

  it('joins and navigates to the group for a valid token when signed in', async () => {
    const container = createTestContainer();
    await container.resolve(AUTH).signIn('jay@example.com', 'password');

    const group = groupFactory({ id: 'g1', name: 'Roomies' });
    const joinAuthenticated = jest.fn().mockResolvedValue(group);
    mockUseJoinGroup.mockReturnValue({
      group, loading: false, error: null, joining: false, joinError: null, joinAuthenticated,
    });

    renderScreen(<JoinGroupScreen />, container);

    fireEvent.press(screen.getByText('Join Roomies'));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/group/g1'));
  });
});
