import React from 'react';
import { render, screen, configure, waitFor, fireEvent } from '@testing-library/react-native';
import { ServiceContext } from '../../core/di/ServiceContext';
import { createTestContainer } from '../../core/di/testContainer';
import { MockEntitlementService } from '../../__mocks__/MockEntitlementService';

// RNTL 12 + React 19 + RN 0.83: detectHostComponentNames fails because RN's Modal
// causes the probe renderer to unmount before .root is accessed. Pre-configure the
// host component names so the detection step is skipped entirely.
configure({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  hostComponentNames: { text: 'Text', textInput: 'TextInput', image: 'Image', switch: 'Switch', scrollView: 'ScrollView', modal: 'Modal' } as any,
});

// Mock Modal as a passthrough so rendering PaywallSheet in tests doesn't try
// to open a native modal portal that doesn't exist in the test renderer.
jest.mock('react-native/Libraries/Modal/Modal', () => {
  const React = require('react');
  function MockModal({ children, testID }: { children?: React.ReactNode; testID?: string }) {
    return React.createElement('View', { testID }, children);
  }
  return { __esModule: true, default: MockModal };
});

import { PaywallSheet } from '../components/PaywallSheet';

function makeWrapper(entitlement: MockEntitlementService) {
  const container = createTestContainer({ entitlementService: entitlement });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(ServiceContext.Provider, { value: container }, children);
  };
}

const BASE_PROPS = {
  visible: true,
  onClose: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ── plan visibility ───────────────────────────────────────────────────────────

test('shows both Trip Pass and Premium options when a tripId is given and free tier', async () => {
  const entitlement = new MockEntitlementService();
  render(<PaywallSheet {...BASE_PROPS} tripId="t1" />, { wrapper: makeWrapper(entitlement) });

  await waitFor(() => {
    expect(screen.getByTestId('paywall-trip-pass-card')).toBeTruthy();
    expect(screen.getByTestId('paywall-premium-card')).toBeTruthy();
  });
});

test('hides the Trip Pass option when no tripId is given', async () => {
  const entitlement = new MockEntitlementService();
  render(<PaywallSheet {...BASE_PROPS} />, { wrapper: makeWrapper(entitlement) });

  await waitFor(() => {
    expect(screen.getByTestId('paywall-premium-card')).toBeTruthy();
  });
  expect(screen.queryByTestId('paywall-trip-pass-card')).toBeNull();
});

test('shows "already unlocked" and hides both purchase options when subscribed', async () => {
  const entitlement = new MockEntitlementService();
  entitlement.grantSubscription(new Date('2099-01-01T00:00:00Z'));
  render(<PaywallSheet {...BASE_PROPS} tripId="t1" />, { wrapper: makeWrapper(entitlement) });

  await waitFor(() => {
    expect(screen.getByText('You already have full access — no purchase needed.')).toBeTruthy();
  });
  expect(screen.queryByTestId('paywall-trip-pass-card')).toBeNull();
  expect(screen.queryByTestId('paywall-premium-card')).toBeNull();
});

test('shows "already unlocked" when the override flag is set', async () => {
  const entitlement = new MockEntitlementService();
  entitlement.setOverride(true);
  render(<PaywallSheet {...BASE_PROPS} tripId="t1" />, { wrapper: makeWrapper(entitlement) });

  await waitFor(() => {
    expect(screen.getByText('You already have full access — no purchase needed.')).toBeTruthy();
  });
});

// ── purchase flow ────────────────────────────────────────────────────────────

test('a successful Trip Pass purchase calls onPurchased and onClose', async () => {
  const entitlement = new MockEntitlementService();
  const onClose     = jest.fn();
  const onPurchased = jest.fn();
  render(
    <PaywallSheet visible tripId="t1" onClose={onClose} onPurchased={onPurchased} />,
    { wrapper: makeWrapper(entitlement) },
  );

  await waitFor(() => expect(screen.getByTestId('paywall-trip-pass-button')).toBeTruthy());
  fireEvent.press(screen.getByTestId('paywall-trip-pass-button'));

  await waitFor(() => {
    expect(onPurchased).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

test('a failed purchase shows an error banner and does not close the sheet', async () => {
  const entitlement = new MockEntitlementService();
  entitlement.shouldFail = true;
  const onClose = jest.fn();
  render(<PaywallSheet visible tripId="t1" onClose={onClose} />, { wrapper: makeWrapper(entitlement) });

  await waitFor(() => expect(screen.getByTestId('paywall-premium-button')).toBeTruthy());
  fireEvent.press(screen.getByTestId('paywall-premium-button'));

  await waitFor(() => {
    expect(screen.getByText('Mock failure')).toBeTruthy();
  });
  expect(onClose).not.toHaveBeenCalled();
});

test('a cancelled purchase shows no error banner and does not close the sheet', async () => {
  const entitlement = new MockEntitlementService();
  entitlement.shouldCancel = true;
  const onClose = jest.fn();
  render(<PaywallSheet visible tripId="t1" onClose={onClose} />, { wrapper: makeWrapper(entitlement) });

  await waitFor(() => expect(screen.getByTestId('paywall-premium-button')).toBeTruthy());
  fireEvent.press(screen.getByTestId('paywall-premium-button'));

  await waitFor(() => {
    expect(screen.getByText('Subscribe')).toBeTruthy(); // button re-enabled, sheet still showing the plan
  });
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.queryByText('Purchase cancelled')).toBeNull();
});

test('restoring purchases does not close the sheet on success', async () => {
  const entitlement = new MockEntitlementService();
  const onClose = jest.fn();
  render(<PaywallSheet visible tripId="t1" onClose={onClose} />, { wrapper: makeWrapper(entitlement) });

  await waitFor(() => expect(screen.getByText('Restore purchases')).toBeTruthy());
  fireEvent.press(screen.getByText('Restore purchases'));

  await waitFor(() => {
    expect(screen.getByText('Restore purchases')).toBeTruthy(); // back to idle label
  });
  expect(onClose).not.toHaveBeenCalled();
});

test('closing via "Not now" calls onClose', async () => {
  const entitlement = new MockEntitlementService();
  const onClose = jest.fn();
  render(<PaywallSheet visible onClose={onClose} />, { wrapper: makeWrapper(entitlement) });

  await waitFor(() => expect(screen.getByText('Not now')).toBeTruthy());
  fireEvent.press(screen.getByText('Not now'));

  expect(onClose).toHaveBeenCalledTimes(1);
});
