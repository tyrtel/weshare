import React from 'react';
import { Alert } from 'react-native';
import { render, screen, configure, waitFor, fireEvent } from '@testing-library/react-native';
import { mockVectorIconsModule } from '../../../__testUtils__/standardMocks';

jest.mock('@expo/vector-icons', () => mockVectorIconsModule());

// RNTL 12 + React 19 + RN 0.83: detectHostComponentNames fails because RN's Modal
// causes the probe renderer to unmount before .root is accessed (see PaywallSheet.test.tsx).
configure({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  hostComponentNames: { text: 'Text', textInput: 'TextInput', image: 'Image', switch: 'Switch', scrollView: 'ScrollView', modal: 'Modal' } as any,
});

// Unlike PaywallSheet.test.tsx (which always passes visible={true} directly),
// ReceiptCapture keeps PaywallSheet permanently mounted and toggles its own
// `visible` prop — so this mock must actually honor `visible`, unlike that
// file's simpler version, or a hidden paywall would still render its content.
jest.mock('react-native/Libraries/Modal/Modal', () => {
  const ReactLib = require('react');
  function MockModal({ children, testID, visible }: { children?: React.ReactNode; testID?: string; visible?: boolean }) {
    if (visible === false) return null;
    return ReactLib.createElement('View', { testID }, children);
  }
  return { __esModule: true, default: MockModal };
});

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync:  jest.fn(),
  launchCameraAsync:              jest.fn(),
  launchImageLibraryAsync:        jest.fn(),
}));

import * as ImagePicker from 'expo-image-picker';
import { ServiceContext } from '../../../core/di/ServiceContext';
import { createTestContainer } from '../../../core/di/testContainer';
import { MockReceiptParserService } from '../../../__mocks__/MockReceiptParserService';
import { MockEntitlementService } from '../../../__mocks__/MockEntitlementService';
import type { ServiceContainer } from '../../../core/di/ServiceContainer';
import { ReceiptCapture } from '../components/ReceiptCapture';

const mockRequestCamera = ImagePicker.requestCameraPermissionsAsync as jest.Mock;
const mockLaunchCamera  = ImagePicker.launchCameraAsync             as jest.Mock;

function makeWrapper(container: ServiceContainer) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(ServiceContext.Provider, { value: container }, children);
  };
}

async function captureAPhoto() {
  jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
    buttons?.find(b => b.text === 'Take Photo')?.onPress?.();
  });
  mockRequestCamera.mockResolvedValue({ status: 'granted' });
  mockLaunchCamera.mockResolvedValue({
    canceled: false,
    assets: [{ base64: 'abc123', mimeType: 'image/jpeg' }],
  });
  fireEvent.press(await screen.findByLabelText('Scan receipt'));
}

afterEach(() => jest.restoreAllMocks());

describe('ReceiptCapture — usage display', () => {
  it('shows the remaining free-scan count on the free tier', async () => {
    const entitlement = new MockEntitlementService();
    entitlement.setUsageCount('ocr_scan', 2);
    const container = createTestContainer({ entitlementService: entitlement });
    render(<ReceiptCapture onParsed={jest.fn()} />, { wrapper: makeWrapper(container) });

    await waitFor(() => expect(screen.getByText('3 free scans left')).toBeTruthy());
  });

  it('hides the remaining count once the user has full access', async () => {
    const entitlement = new MockEntitlementService();
    entitlement.grantSubscription(new Date('2099-01-01T00:00:00Z'));
    const container = createTestContainer({ entitlementService: entitlement });
    render(<ReceiptCapture onParsed={jest.fn()} />, { wrapper: makeWrapper(container) });

    await waitFor(() => expect(screen.getByLabelText('Scan receipt')).toBeTruthy());
    expect(screen.queryByText(/free scans? left/)).toBeNull();
  });

  it('an active trip pass for the given tripId also hides the remaining count', async () => {
    const entitlement = new MockEntitlementService();
    entitlement.grantTripPass('trip-1', new Date('2099-01-01T00:00:00Z'));
    const container = createTestContainer({ entitlementService: entitlement });
    render(<ReceiptCapture onParsed={jest.fn()} tripId="trip-1" />, { wrapper: makeWrapper(container) });

    await waitFor(() => expect(screen.getByLabelText('Scan receipt')).toBeTruthy());
    expect(screen.queryByText(/free scans? left/)).toBeNull();
  });
});

describe('ReceiptCapture — OCR limit reached', () => {
  it('shows the paywall instead of the generic error banner when the server returns OCR_LIMIT_REACHED', async () => {
    const parser = new MockReceiptParserService();
    parser.shouldHitLimit = true;
    const container = createTestContainer({ receiptParser: parser, entitlementService: new MockEntitlementService() });
    render(<ReceiptCapture onParsed={jest.fn()} tripId="trip-1" />, { wrapper: makeWrapper(container) });

    await captureAPhoto();

    await waitFor(() => expect(screen.getByTestId('paywall-trip-pass-card')).toBeTruthy());
    expect(screen.queryByText("Couldn't read receipt — please fill in manually")).toBeNull();
  });

  it('passes tripId through to the receipt parser', async () => {
    const parser = new MockReceiptParserService();
    const container = createTestContainer({ receiptParser: parser, entitlementService: new MockEntitlementService() });
    render(<ReceiptCapture onParsed={jest.fn()} tripId="trip-42" />, { wrapper: makeWrapper(container) });

    await captureAPhoto();

    await waitFor(() => expect(parser.tripIds).toContain('trip-42'));
  });

  it('a generic parse failure still shows the ordinary error banner, not the paywall', async () => {
    const parser = new MockReceiptParserService();
    parser.shouldFail = true;
    const container = createTestContainer({ receiptParser: parser, entitlementService: new MockEntitlementService() });
    render(<ReceiptCapture onParsed={jest.fn()} />, { wrapper: makeWrapper(container) });

    await captureAPhoto();

    await waitFor(() => expect(screen.getByText("Couldn't read receipt — please fill in manually")).toBeTruthy());
    expect(screen.queryByTestId('paywall-premium-card')).toBeNull();
  });
});
