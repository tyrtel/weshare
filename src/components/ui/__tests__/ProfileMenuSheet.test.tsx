import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert, Linking } from 'react-native';
import { mockVectorIconsModule } from '../../../__testUtils__/standardMocks';

jest.mock('@expo/vector-icons', () => mockVectorIconsModule());

import { renderScreen } from '../../../__testUtils__/renderScreen';
import { createTestContainer } from '../../../core/di/testContainer';
import { MockEntitlementService } from '../../../__mocks__/MockEntitlementService';
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

  describe('subscription management', () => {
    beforeEach(() => {
      jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
      jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    });

    afterEach(() => jest.restoreAllMocks());

    it('shows Manage subscription and Restore purchases', () => {
      renderScreen(
        <ProfileMenuSheet visible onClose={jest.fn()} onNewTrip={jest.fn()} onNewGroup={jest.fn()} onLogOut={jest.fn()} />,
      );
      expect(screen.getByText('Manage subscription')).toBeTruthy();
      expect(screen.getByText('Restore purchases')).toBeTruthy();
    });

    it('opens the platform subscription-management URL and does not close the sheet', () => {
      const onClose = jest.fn();
      renderScreen(
        <ProfileMenuSheet visible onClose={onClose} onNewTrip={jest.fn()} onNewGroup={jest.fn()} onLogOut={jest.fn()} />,
      );

      fireEvent.press(screen.getByText('Manage subscription'));

      expect(Linking.openURL).toHaveBeenCalledTimes(1);
      expect(Linking.openURL).toHaveBeenCalledWith(expect.stringContaining('subscriptions'));
      expect(onClose).not.toHaveBeenCalled();
    });

    it('restoring purchases successfully shows a success alert', async () => {
      const entitlement = new MockEntitlementService();
      const container = createTestContainer({ entitlementService: entitlement });
      renderScreen(
        <ProfileMenuSheet visible onClose={jest.fn()} onNewTrip={jest.fn()} onNewGroup={jest.fn()} onLogOut={jest.fn()} />,
        container,
      );

      fireEvent.press(screen.getByText('Restore purchases'));

      await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Purchases restored', 'Your entitlements are up to date.'));
    });

    it('a failed restore shows an error alert instead of a success alert', async () => {
      const entitlement = new MockEntitlementService();
      entitlement.shouldFail = true;
      const container = createTestContainer({ entitlementService: entitlement });
      renderScreen(
        <ProfileMenuSheet visible onClose={jest.fn()} onNewTrip={jest.fn()} onNewGroup={jest.fn()} onLogOut={jest.fn()} />,
        container,
      );

      fireEvent.press(screen.getByText('Restore purchases'));

      await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Restore failed', 'Mock failure'));
    });
  });
});
