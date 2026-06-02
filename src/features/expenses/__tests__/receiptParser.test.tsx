import React from 'react';
import { Alert } from 'react-native';
import { renderHook, act, render, fireEvent, waitFor } from '@testing-library/react-native';
import { ServiceContext } from '../../../core/di/ServiceContext';
import { createTestContainer } from '../../../core/di/testContainer';
import { MockReceiptParserService } from '../../../__mocks__/MockReceiptParserService';
import { useReceiptParser } from '../../../hooks/useReceiptParser';
import { ReceiptCameraButton } from '../../../components/ui/ReceiptCameraButton';
import type { ServiceContainer } from '../../../core/di/ServiceContainer';
import type { ParsedReceipt } from '../../../core/models/ParsedReceipt';

// ── expo-image-picker mock ────────────────────────────────────────────────────
// Controlled per-test via mockReturnValue on the individual fns.

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync:  jest.fn(),
  launchCameraAsync:              jest.fn(),
  launchImageLibraryAsync:        jest.fn(),
}));

import * as ImagePicker from 'expo-image-picker';
const mockRequestCamera  = ImagePicker.requestCameraPermissionsAsync as jest.Mock;
const mockLaunchCamera   = ImagePicker.launchCameraAsync             as jest.Mock;

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeWrapper(container: ServiceContainer) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(ServiceContext.Provider, { value: container }, children);
  };
}

const FULL_RECEIPT: ParsedReceipt = {
  merchant:         'Café de Flore',
  date:             '2026-05-14',
  currency:         'EUR',
  totalAmountCents: 4750,
  lineItems: [
    { description: 'Croque Monsieur',  amountCents: 1600 },
    { description: 'Café au lait x2', amountCents: 1400 },
    { description: 'Tarte Tatin',      amountCents: 1750 },
  ],
};

// ── MockReceiptParserService unit tests ──────────────────────────────────────

describe('MockReceiptParserService', () => {
  it('returns the configured mockResult on success', async () => {
    const svc = new MockReceiptParserService();
    const result = await svc.parseReceipt('abc123', 'image/jpeg');
    expect(result).toEqual(svc.mockResult);
  });

  it('throws when shouldFail is true', async () => {
    const svc = new MockReceiptParserService();
    svc.shouldFail = true;
    await expect(svc.parseReceipt('abc123', 'image/jpeg')).rejects.toThrow('RECEIPT_PARSE_FAILED');
  });

  it('records the first 16 chars of each imageBase64 in calls', async () => {
    const svc = new MockReceiptParserService();
    await svc.parseReceipt('abcdefghijklmnopqrstuvwxyz', 'image/jpeg');
    await svc.parseReceipt('1234567890123456789', 'image/png');
    expect(svc.calls).toEqual(['abcdefghijklmnop', '1234567890123456']);
  });

  it('returns a copy of mockResult so mutations do not bleed between calls', async () => {
    const svc = new MockReceiptParserService();
    const r1 = await svc.parseReceipt('x', 'image/jpeg');
    r1.lineItems.push({ description: 'Extra', amountCents: 999 });
    const r2 = await svc.parseReceipt('x', 'image/jpeg');
    expect(r2.lineItems).toHaveLength(svc.mockResult.lineItems.length);
  });
});

// ── useReceiptParser hook ─────────────────────────────────────────────────────

describe('useReceiptParser', () => {
  it('happy path — returns result, parsing=false, error=null', async () => {
    const parserSvc = new MockReceiptParserService();
    parserSvc.mockResult = { ...FULL_RECEIPT };
    const container = createTestContainer({ receiptParser: parserSvc });
    const { result } = renderHook(() => useReceiptParser(), { wrapper: makeWrapper(container) });

    let parsed: ParsedReceipt | null = null;
    await act(async () => {
      parsed = await result.current.parseReceipt('img==', 'image/jpeg');
    });

    expect(parsed).toEqual(FULL_RECEIPT);
    expect(result.current.parsing).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('failure — returns null, error is set, parsing=false', async () => {
    const parserSvc = new MockReceiptParserService();
    parserSvc.shouldFail = true;
    const container = createTestContainer({ receiptParser: parserSvc });
    const { result } = renderHook(() => useReceiptParser(), { wrapper: makeWrapper(container) });

    let parsed: ParsedReceipt | null = null;
    await act(async () => {
      parsed = await result.current.parseReceipt('img==', 'image/jpeg');
    });

    expect(parsed).toBeNull();
    expect(result.current.error).toBe('Mock failure');
    expect(result.current.parsing).toBe(false);
  });

  it('partial parse — merchant=null is returned without error', async () => {
    const parserSvc = new MockReceiptParserService();
    parserSvc.mockResult = { ...FULL_RECEIPT, merchant: null };
    const container = createTestContainer({ receiptParser: parserSvc });
    const { result } = renderHook(() => useReceiptParser(), { wrapper: makeWrapper(container) });

    let parsed: ParsedReceipt | null = null;
    await act(async () => {
      parsed = await result.current.parseReceipt('img==', 'image/jpeg');
    });

    expect(parsed?.merchant).toBeNull();
    expect(parsed?.totalAmountCents).toBe(FULL_RECEIPT.totalAmountCents);
    expect(result.current.error).toBeNull();
  });

  it('clearError resets the error field', async () => {
    const parserSvc = new MockReceiptParserService();
    parserSvc.shouldFail = true;
    const container = createTestContainer({ receiptParser: parserSvc });
    const { result } = renderHook(() => useReceiptParser(), { wrapper: makeWrapper(container) });

    await act(async () => { await result.current.parseReceipt('img==', 'image/jpeg'); });
    expect(result.current.error).not.toBeNull();

    act(() => { result.current.clearError(); });
    expect(result.current.error).toBeNull();
  });
});

// ── ReceiptCameraButton — permission denied ───────────────────────────────────

describe('ReceiptCameraButton — camera permission denied', () => {
  beforeEach(() => {
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
      // Simulate the user tapping "Take Photo"
      const takePhoto = buttons?.find(b => b.text === 'Take Photo');
      takePhoto?.onPress?.();
    });
    mockRequestCamera.mockResolvedValue({ status: 'denied' });
    mockLaunchCamera.mockClear();
  });

  afterEach(() => jest.restoreAllMocks());

  it('does not call onImageCaptured when camera permission is denied', async () => {
    const onImageCaptured = jest.fn();
    render(<ReceiptCameraButton onImageCaptured={onImageCaptured} />);

    const button = await waitFor(() =>
      require('@testing-library/react-native').screen.getByRole('button'),
    );
    fireEvent.press(button);

    await waitFor(() => expect(mockRequestCamera).toHaveBeenCalled());
    expect(mockLaunchCamera).not.toHaveBeenCalled();
    expect(onImageCaptured).not.toHaveBeenCalled();
  });
});
