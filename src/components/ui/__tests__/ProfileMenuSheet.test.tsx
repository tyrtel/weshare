import React from 'react';
import { screen, fireEvent } from '@testing-library/react-native';
import { mockVectorIconsModule } from '../../../__testUtils__/standardMocks';

jest.mock('@expo/vector-icons', () => mockVectorIconsModule());

import { renderScreen } from '../../../__testUtils__/renderScreen';
import { ProfileMenuSheet } from '../ProfileMenuSheet';
import { useThemeStore } from '../../../store/themeStore';

describe('ProfileMenuSheet', () => {
  beforeEach(() => {
    useThemeStore.setState({ preference: 'system' });
  });

  it('shows the theme switcher with Light, Dark, and System options', () => {
    renderScreen(
      <ProfileMenuSheet visible onClose={jest.fn()} onNewTrip={jest.fn()} onNewGroup={jest.fn()} onLogOut={jest.fn()} />,
    );
    expect(screen.getByText('Light')).toBeTruthy();
    expect(screen.getByText('Dark')).toBeTruthy();
    expect(screen.getByText('System')).toBeTruthy();
  });

  it('switches the theme preference when Dark is pressed', () => {
    renderScreen(
      <ProfileMenuSheet visible onClose={jest.fn()} onNewTrip={jest.fn()} onNewGroup={jest.fn()} onLogOut={jest.fn()} />,
    );
    fireEvent.press(screen.getByText('Dark'));
    expect(useThemeStore.getState().preference).toBe('dark');
  });

  it('renders nothing interactive when not visible', () => {
    renderScreen(
      <ProfileMenuSheet visible={false} onClose={jest.fn()} onNewTrip={jest.fn()} onNewGroup={jest.fn()} onLogOut={jest.fn()} />,
    );
    expect(screen.queryByText('Log out')).toBeNull();
  });

  it('shows New trip, New group, and Log out when visible', () => {
    renderScreen(
      <ProfileMenuSheet visible onClose={jest.fn()} onNewTrip={jest.fn()} onNewGroup={jest.fn()} onLogOut={jest.fn()} />,
    );
    expect(screen.getByText('New trip')).toBeTruthy();
    expect(screen.getByText('New group')).toBeTruthy();
    expect(screen.getByText('Log out')).toBeTruthy();
  });

  it('calls onNewTrip and onClose when New trip is pressed', () => {
    const onNewTrip = jest.fn();
    const onClose   = jest.fn();
    renderScreen(
      <ProfileMenuSheet visible onClose={onClose} onNewTrip={onNewTrip} onNewGroup={jest.fn()} onLogOut={jest.fn()} />,
    );

    fireEvent.press(screen.getByText('New trip'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onNewTrip).toHaveBeenCalledTimes(1);
  });

  it('calls onLogOut and onClose when Log out is pressed', () => {
    const onLogOut = jest.fn();
    const onClose  = jest.fn();
    renderScreen(
      <ProfileMenuSheet visible onClose={onClose} onNewTrip={jest.fn()} onNewGroup={jest.fn()} onLogOut={onLogOut} />,
    );

    fireEvent.press(screen.getByText('Log out'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onLogOut).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the backdrop is pressed', () => {
    const onClose = jest.fn();
    renderScreen(
      <ProfileMenuSheet visible onClose={onClose} onNewTrip={jest.fn()} onNewGroup={jest.fn()} onLogOut={jest.fn()} />,
    );

    fireEvent.press(screen.getByLabelText('Close menu'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
