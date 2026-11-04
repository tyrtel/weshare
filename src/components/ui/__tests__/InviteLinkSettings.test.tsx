import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { mockVectorIconsModule } from '../../../__testUtils__/standardMocks';

jest.mock('@expo/vector-icons', () => mockVectorIconsModule());

import { InviteLinkSettings } from '../InviteLinkSettings';

const HOUR = 3_600_000;

function renderSettings(props: Partial<React.ComponentProps<typeof InviteLinkSettings>> = {}) {
  const onChangeTtl = jest.fn();
  const onReset = jest.fn();
  render(
    <InviteLinkSettings
      createdAt={new Date(Date.now() - HOUR)}
      ttlHours={168}
      canManage
      busy={false}
      error={null}
      onChangeTtl={onChangeTtl}
      onReset={onReset}
      {...props}
    />,
  );
  return { onChangeTtl, onReset };
}

describe('InviteLinkSettings', () => {
  it('shows the time left and lets the owner change the lifetime', () => {
    const { onChangeTtl } = renderSettings();

    expect(screen.getByText('Expires in 6 days')).toBeTruthy();
    fireEvent.press(screen.getByText('Never'));
    expect(onChangeTtl).toHaveBeenCalledWith(null);
    fireEvent.press(screen.getByText('24 hours'));
    expect(onChangeTtl).toHaveBeenCalledWith(24);
  });

  it('resets the link only after the owner confirms', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { onReset } = renderSettings();

    fireEvent.press(screen.getByLabelText('Reset link'));
    expect(onReset).not.toHaveBeenCalled();

    const buttons = alert.mock.calls[0][2]!;
    buttons.find(b => b.text === 'Reset')!.onPress!();
    return Promise.resolve().then(() => expect(onReset).toHaveBeenCalled());
  });

  it('shows members the status only, and who to ask once it has expired', () => {
    renderSettings({ canManage: false, createdAt: new Date(Date.now() - 25 * HOUR), ttlHours: 24 });

    expect(screen.getByText('This link has expired')).toBeTruthy();
    expect(screen.getByText('Ask the owner for a new link.')).toBeTruthy();
    expect(screen.queryByText('Reset link')).toBeNull();
    expect(screen.queryByText('Never')).toBeNull();
  });

  it('says a closed trip’s link no longer works, with no controls', () => {
    renderSettings({ closed: true });

    expect(screen.getByText('This trip is closed, so its invite link no longer works')).toBeTruthy();
    expect(screen.queryByText('Reset link')).toBeNull();
  });

  it('says when a link never expires', () => {
    renderSettings({ ttlHours: null });
    expect(screen.getByText('This link never expires')).toBeTruthy();
  });
});
