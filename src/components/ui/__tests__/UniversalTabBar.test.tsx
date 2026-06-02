const mockPush = jest.fn();
let mockPathname = '/';

jest.mock('expo-router', () => ({
  usePathname: () => mockPathname,
  useRouter:   () => ({ push: mockPush }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { UniversalTabBar } from '../UniversalTabBar';

const ACTIVE_TINT   = '#1D9E75';
const INACTIVE_TINT = '#5a5a7a';

function renderBar(pathname: string) {
  mockPathname = pathname;
  return render(<UniversalTabBar />);
}

describe('UniversalTabBar', () => {
  beforeEach(() => { mockPush.mockClear(); });

  it('renders both tab labels', () => {
    const { getByText } = renderBar('/');
    expect(getByText('Trips')).toBeTruthy();
    expect(getByText('Balance')).toBeTruthy();
  });

  it('Trips tab is active on root path', () => {
    const { getByLabelText } = renderBar('/');
    expect(getByLabelText('Trips').props.accessibilityState).toEqual({ selected: true });
    expect(getByLabelText('Balance').props.accessibilityState).toEqual({ selected: false });
  });

  it('Trips tab is active on /trip/abc', () => {
    const { getByLabelText } = renderBar('/trip/abc');
    expect(getByLabelText('Trips').props.accessibilityState).toEqual({ selected: true });
    expect(getByLabelText('Balance').props.accessibilityState).toEqual({ selected: false });
  });

  it('Balance tab is active on /balance', () => {
    const { getByLabelText } = renderBar('/balance');
    expect(getByLabelText('Balance').props.accessibilityState).toEqual({ selected: true });
    expect(getByLabelText('Trips').props.accessibilityState).toEqual({ selected: false });
  });

  it('Balance tab is active on /settle/t1', () => {
    const { getByLabelText } = renderBar('/settle/t1');
    expect(getByLabelText('Balance').props.accessibilityState).toEqual({ selected: true });
    expect(getByLabelText('Trips').props.accessibilityState).toEqual({ selected: false });
  });

  it('pressing Trips tab calls router.push("/")', () => {
    const { getByLabelText } = renderBar('/balance');
    fireEvent.press(getByLabelText('Trips'));
    expect(mockPush).toHaveBeenCalledWith('/');
  });

  it('pressing Balance tab calls router.push("/balance")', () => {
    const { getByLabelText } = renderBar('/');
    fireEvent.press(getByLabelText('Balance'));
    expect(mockPush).toHaveBeenCalledWith('/balance');
  });
});
