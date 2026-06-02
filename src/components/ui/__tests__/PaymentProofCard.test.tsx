jest.mock('expo-print', () => ({
  printToFileAsync: jest.fn(),
}));

jest.mock('expo-sharing', () => ({
  shareAsync: jest.fn(),
}));

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { ServiceContext } from '../../../core/di/ServiceContext';
import { createTestContainer } from '../../../core/di/testContainer';
import { PaymentProofCard } from '../PaymentProofCard';
import type { SplitRequest } from '../../../core/models/SplitRequest';
import { splitRequestFactory } from '../../../__testUtils__/factories';

function makeWrapper() {
  const container = createTestContainer();
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(ServiceContext.Provider, { value: container }, children);
  };
}

const NOW = new Date('2025-12-25T12:00:00Z');

describe('PaymentProofCard', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('renders the download button', () => {
    render(<PaymentProofCard splitRequest={splitRequestFactory()} />, { wrapper: makeWrapper() });
    expect(screen.getByLabelText('Download payment proof PDF')).toBeTruthy();
  });

  it('calls printToFileAsync then shareAsync when button is pressed', async () => {
    const Print   = require('expo-print')   as { printToFileAsync: jest.Mock };
    const Sharing = require('expo-sharing') as { shareAsync: jest.Mock };
    Print.printToFileAsync.mockResolvedValue({ uri: '/tmp/proof.pdf' });
    Sharing.shareAsync.mockResolvedValue(undefined);

    render(<PaymentProofCard splitRequest={splitRequestFactory()} />, { wrapper: makeWrapper() });
    fireEvent.press(screen.getByLabelText('Download payment proof PDF'));

    await waitFor(() => {
      expect(Print.printToFileAsync).toHaveBeenCalledTimes(1);
      const firstArg = Print.printToFileAsync.mock.calls[0][0] as { html: string };
      expect(firstArg.html).toContain('<!DOCTYPE html>');
    });

    expect(Sharing.shareAsync).toHaveBeenCalledWith(
      '/tmp/proof.pdf',
      expect.objectContaining({ mimeType: 'application/pdf' }),
    );
  });

  it('passes payerName and payeeName into the generated HTML', async () => {
    const Print = require('expo-print') as { printToFileAsync: jest.Mock };
    Print.printToFileAsync.mockResolvedValue({ uri: '/tmp/proof.pdf' });
    (require('expo-sharing') as { shareAsync: jest.Mock }).shareAsync.mockResolvedValue(undefined);

    render(
      <PaymentProofCard splitRequest={splitRequestFactory()} payerName="Alice" payeeName="Bob" />,
      { wrapper: makeWrapper() },
    );
    fireEvent.press(screen.getByLabelText('Download payment proof PDF'));

    await waitFor(() => {
      expect(Print.printToFileAsync).toHaveBeenCalledTimes(1);
      const firstArg = Print.printToFileAsync.mock.calls[0][0] as { html: string };
      expect(firstArg.html).toContain('Alice');
      expect(firstArg.html).toContain('Bob');
    });
  });

  it('button is disabled while exporting', async () => {
    const Print   = require('expo-print')   as { printToFileAsync: jest.Mock };
    const Sharing = require('expo-sharing') as { shareAsync: jest.Mock };
    let resolveShare!: () => void;
    Print.printToFileAsync.mockResolvedValue({ uri: '/tmp/proof.pdf' });
    Sharing.shareAsync.mockReturnValue(new Promise<void>(res => { resolveShare = res; }));

    render(<PaymentProofCard splitRequest={splitRequestFactory()} />, { wrapper: makeWrapper() });
    const btn = screen.getByLabelText('Download payment proof PDF');
    fireEvent.press(btn);

    await waitFor(() => expect(Print.printToFileAsync).toHaveBeenCalled());
    expect(btn.props.accessibilityState?.disabled ?? btn.props.disabled).toBe(true);

    resolveShare();
    await waitFor(() => expect(btn.props.accessibilityState?.disabled ?? btn.props.disabled).toBeFalsy());
  });
});
