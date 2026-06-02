import React from 'react';
import { render, screen, configure, waitFor } from '@testing-library/react-native';
import { ServiceContext } from '../../../core/di/ServiceContext';
import { createTestContainer } from '../../../core/di/testContainer';

// RNTL 12 + React 19 + RN 0.83: detectHostComponentNames fails because RN's Modal
// causes the probe renderer to unmount before .root is accessed. Pre-configure the
// host component names so the detection step is skipped entirely.
configure({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  hostComponentNames: { text: 'Text', textInput: 'TextInput', image: 'Image', switch: 'Switch', scrollView: 'ScrollView', modal: 'Modal' } as any,
});

// Mock Modal as a passthrough so rendering PaymentMethodSheet in tests doesn't
// try to open a native modal portal that doesn't exist in the test renderer.
jest.mock('react-native/Libraries/Modal/Modal', () => {
  const React = require('react');
  function MockModal({ children, testID }: { children?: React.ReactNode; testID?: string }) {
    return React.createElement('View', { testID }, children);
  }
  return { __esModule: true, default: MockModal };
});

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

import { PaymentMethodSheet } from '../components/PaymentMethodSheet';
import { PAYMENT_REGISTRY } from '../../../core/di/tokens';
import { MockPaymentMethodRegistry } from '../../../__mocks__/MockPaymentMethodRegistry';
import type { IPaymentMethod } from '../../../core/interfaces/IPaymentMethod';

const BASE_PROPS = {
  visible: true,
  tripId: 't1',
  payerUserId: 'u1',
  requesterUserId: 'u2',
  currency: 'EUR',
  recipientName: 'Marie',
  onClose: jest.fn(),
  onPaymentLaunched: jest.fn(),
};

function makeWrapper() {
  const container = createTestContainer();
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(ServiceContext.Provider, { value: container }, children);
  };
}

test('renders error message when amountCents is zero', () => {
  render(<PaymentMethodSheet {...BASE_PROPS} amountCents={0} />, { wrapper: makeWrapper() });
  expect(screen.getByText('Invalid payment amount. Please go back and try again.')).toBeTruthy();
});

test('renders error message when amountCents is negative', () => {
  render(<PaymentMethodSheet {...BASE_PROPS} amountCents={-500} />, { wrapper: makeWrapper() });
  expect(screen.getByText('Invalid payment amount. Please go back and try again.')).toBeTruthy();
});

test('renders error message when amountCents is NaN', () => {
  render(<PaymentMethodSheet {...BASE_PROPS} amountCents={NaN} />, { wrapper: makeWrapper() });
  expect(screen.getByText('Invalid payment amount. Please go back and try again.')).toBeTruthy();
});

test('does not render error message when amountCents is valid', () => {
  render(<PaymentMethodSheet {...BASE_PROPS} amountCents={2500} />, { wrapper: makeWrapper() });
  expect(screen.queryByText('Invalid payment amount. Please go back and try again.')).toBeNull();
});

// ── Payment method list ───────────────────────────────────────────────────────

function mockMethod(key: string, label: string, description: string): IPaymentMethod {
  return {
    meta: { key, label, description, iconName: 'card' },
    canHandle: async () => true,
    launch: jest.fn(),
  };
}

test('shows only the methods returned by the registry when no native wallets are installed', async () => {
  const container = createTestContainer();
  const registry = container.resolve(PAYMENT_REGISTRY) as MockPaymentMethodRegistry;
  registry.methods = [
    mockMethod('stripe',       'Stripe',        'Pay by card'),
    mockMethod('open_banking', 'Bank Transfer', 'SEPA bank transfer'),
  ];

  const wrapper = function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(ServiceContext.Provider, { value: container }, children);
  };

  render(<PaymentMethodSheet {...BASE_PROPS} amountCents={2500} />, { wrapper });

  await waitFor(() => {
    expect(screen.getByText('Stripe')).toBeTruthy();
    expect(screen.getByText('Bank Transfer')).toBeTruthy();
  });

  expect(screen.queryByText('Revolut')).toBeNull();
  expect(screen.queryByText('Lydia')).toBeNull();
  expect(screen.queryByText('PayPal')).toBeNull();
});
