import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { ServiceContext } from '../../../core/di/ServiceContext';
import { createTestContainer } from '../../../core/di/testContainer';
import { OPEN_BANKING } from '../../../core/di/tokens';
import { MockOpenBankingService } from '../../../__mocks__/MockOpenBankingService';

jest.mock('expo-router', () => ({
  useRouter:          () => ({ back: jest.fn() }),
  useLocalSearchParams: jest.fn(),
  Stack:              { Screen: () => null },
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView:        View,
    useSafeAreaInsets:   () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

import { useLocalSearchParams } from 'expo-router';
import { BankPaymentScreen } from '../screens/BankPaymentScreen';

const mockParams = useLocalSearchParams as jest.Mock;

function makeWrapper(container = createTestContainer()) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(ServiceContext.Provider, { value: container }, children);
  };
}

const VALID_PARAMS = {
  tripId:          't1',
  payerUserId:     'u1',
  requesterUserId: 'u2',
  amountCents:     '2500',
  currency:        'EUR',
  recipientName:   'Marie',
};

describe('BankPaymentScreen — param validation', () => {
  it('shows error view when amountCents is missing', () => {
    mockParams.mockReturnValue({ ...VALID_PARAMS, amountCents: undefined });
    render(<BankPaymentScreen />, { wrapper: makeWrapper() });
    expect(screen.getByText('Invalid payment parameters.')).toBeTruthy();
  });

  it('shows error view when amountCents is not a number', () => {
    mockParams.mockReturnValue({ ...VALID_PARAMS, amountCents: 'abc' });
    render(<BankPaymentScreen />, { wrapper: makeWrapper() });
    expect(screen.getByText('Invalid payment parameters.')).toBeTruthy();
  });

  it('shows error view when amountCents is zero', () => {
    mockParams.mockReturnValue({ ...VALID_PARAMS, amountCents: '0' });
    render(<BankPaymentScreen />, { wrapper: makeWrapper() });
    expect(screen.getByText('Invalid payment parameters.')).toBeTruthy();
  });

  it('shows error view when amountCents is negative', () => {
    mockParams.mockReturnValue({ ...VALID_PARAMS, amountCents: '-100' });
    render(<BankPaymentScreen />, { wrapper: makeWrapper() });
    expect(screen.getByText('Invalid payment parameters.')).toBeTruthy();
  });

  it('shows error view when tripId is missing', () => {
    mockParams.mockReturnValue({ ...VALID_PARAMS, tripId: undefined });
    render(<BankPaymentScreen />, { wrapper: makeWrapper() });
    expect(screen.getByText('Invalid payment parameters.')).toBeTruthy();
  });

  it('shows error view when payerUserId is missing', () => {
    mockParams.mockReturnValue({ ...VALID_PARAMS, payerUserId: undefined });
    render(<BankPaymentScreen />, { wrapper: makeWrapper() });
    expect(screen.getByText('Invalid payment parameters.')).toBeTruthy();
  });

  it('renders the payment form with valid params', () => {
    mockParams.mockReturnValue(VALID_PARAMS);
    render(<BankPaymentScreen />, { wrapper: makeWrapper() });
    expect(screen.getByText('SEPA Bank Transfer')).toBeTruthy();
    expect(screen.queryByText('Invalid payment parameters.')).toBeNull();
  });

  it('renders the correct amount and recipient with valid params', () => {
    mockParams.mockReturnValue(VALID_PARAMS);
    render(<BankPaymentScreen />, { wrapper: makeWrapper() });
    // amountCents 2500 → €25.00
    expect(screen.getByText(/\$?25\.00|€25/)).toBeTruthy();
    expect(screen.getByText(/Marie/)).toBeTruthy();
  });
});

// ── OB service failure ────────────────────────────────────────────────────────

describe('BankPaymentScreen — ob.initiatePayment failure', () => {
  it('shows an alert when initiatePayment returns an error', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    const container = createTestContainer();
    (container.resolve(OPEN_BANKING) as MockOpenBankingService).shouldFail = true;

    mockParams.mockReturnValue(VALID_PARAMS);
    render(<BankPaymentScreen />, { wrapper: makeWrapper(container) });

    // Enter a valid French IBAN and blur to pass validation.
    const ibanInput = screen.getByLabelText('IBAN input');
    fireEvent(ibanInput, 'focus');
    fireEvent.changeText(ibanInput, 'FR7630006000011234567890189');
    fireEvent(ibanInput, 'blur');

    // Press the Pay button.
    const payButton = screen.getByLabelText('Pay via bank transfer');
    await act(async () => { fireEvent.press(payButton); });

    expect(alertSpy).toHaveBeenCalledWith(
      'Payment failed',
      'Could not initiate bank transfer. Please try again.',
    );

    alertSpy.mockRestore();
  });
});
