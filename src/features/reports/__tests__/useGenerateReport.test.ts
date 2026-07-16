jest.mock('expo-print', () => ({
  printToFileAsync: jest.fn(),
}));

jest.mock('expo-sharing', () => ({
  shareAsync: jest.fn(),
}));

import React from 'react';
import { Platform } from 'react-native';
import { renderHook, act } from '@testing-library/react-native';
import { ServiceContext } from '../../../core/di/ServiceContext';
import { createTestContainer } from '../../../core/di/testContainer';
import { TRIP_STORE } from '../../../core/di/tokens';
import { InMemoryExpenseRepository } from '../../../__mocks__/InMemoryExpenseRepository';
import { InMemorySplitRequestRepository } from '../../../__mocks__/InMemorySplitRequestRepository';
import { MockReportService } from '../../../__mocks__/MockReportService';
import { useGenerateReport } from '../hooks/useGenerateReport';
import { tripFactory, memberFactory, groupFactory, groupMemberFactory, expenseFactory } from '../../../__testUtils__/factories';
import type { ServiceContainer } from '../../../core/di/ServiceContainer';

function makeWrapper(container: ServiceContainer) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(ServiceContext.Provider, { value: container }, children);
  };
}

describe('useGenerateReport', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const Print   = require('expo-print')   as { printToFileAsync: jest.Mock };
    const Sharing = require('expo-sharing') as { shareAsync: jest.Mock };
    Print.printToFileAsync.mockResolvedValue({ uri: '/tmp/report.pdf' });
    Sharing.shareAsync.mockResolvedValue(undefined);
  });

  describe('generateTripReport', () => {
    function setup() {
      const trip = tripFactory({
        id: 't1',
        name: 'Amsterdam',
        members: [memberFactory({ userId: 'u1', displayName: 'Alice' }), memberFactory({ userId: 'u2', displayName: 'Bob' })],
      });
      const expenseRepo = new InMemoryExpenseRepository().seed([
        expenseFactory({ id: 'e1', tripId: 't1', paidByUserId: 'u1' }),
      ]);
      const container = createTestContainer({ expenseRepo });
      container.resolve(TRIP_STORE).getState().appendTrip(trip);
      return container;
    }

    it('generates a PDF and shares it when under the rate limit', async () => {
      const container = setup();
      const { result } = renderHook(() => useGenerateReport(), { wrapper: makeWrapper(container) });

      let success: boolean | undefined;
      await act(async () => { success = await result.current.generateTripReport('t1'); });

      expect(success).toBe(true);
      const Print   = require('expo-print')   as { printToFileAsync: jest.Mock };
      const Sharing = require('expo-sharing') as { shareAsync: jest.Mock };
      expect(Print.printToFileAsync).toHaveBeenCalledTimes(1);
      const html = (Print.printToFileAsync.mock.calls[0][0] as { html: string }).html;
      expect(html).toContain('Amsterdam');
      expect(Sharing.shareAsync).toHaveBeenCalledWith('/tmp/report.pdf', expect.objectContaining({ mimeType: 'application/pdf' }));
      expect(result.current.error).toBeNull();
    });

    it('opens the report HTML in a new tab on web instead of using expo-print/expo-sharing', async () => {
      const originalOS = Platform.OS;
      Platform.OS = 'web';
      const writtenDocs: string[] = [];
      const fakeWindow = { open: jest.fn(() => ({ document: { write: (html: string) => writtenDocs.push(html), close: jest.fn() } })) };
      // @ts-expect-error test-only global stub — this repo's Jest environment has no real `window`.
      global.window = fakeWindow;

      try {
        const container = setup();
        const { result } = renderHook(() => useGenerateReport(), { wrapper: makeWrapper(container) });

        let success: boolean | undefined;
        await act(async () => { success = await result.current.generateTripReport('t1'); });

        expect(success).toBe(true);
        expect(fakeWindow.open).toHaveBeenCalledTimes(1);
        expect(writtenDocs[0]).toContain('Amsterdam');
        const Print   = require('expo-print')   as { printToFileAsync: jest.Mock };
        const Sharing = require('expo-sharing') as { shareAsync: jest.Mock };
        expect(Print.printToFileAsync).not.toHaveBeenCalled();
        expect(Sharing.shareAsync).not.toHaveBeenCalled();
      } finally {
        Platform.OS = originalOS;
        // @ts-expect-error same test-only stub cleanup
        delete global.window;
      }
    });

    it('does not generate when the rate limit is exceeded', async () => {
      const container = setup();
      const reportService = container.resolve(require('../../../core/di/tokens').REPORT_SERVICE) as MockReportService;
      reportService.callCount = reportService.maxCalls;

      const { result } = renderHook(() => useGenerateReport(), { wrapper: makeWrapper(container) });

      let success: boolean | undefined;
      await act(async () => { success = await result.current.generateTripReport('t1'); });

      expect(success).toBe(false);
      expect(result.current.error).toContain('5 reports');
      const Print = require('expo-print') as { printToFileAsync: jest.Mock };
      expect(Print.printToFileAsync).not.toHaveBeenCalled();
    });

    it('updates remaining after a successful generation', async () => {
      const container = setup();
      const { result } = renderHook(() => useGenerateReport(), { wrapper: makeWrapper(container) });

      await act(async () => { await result.current.generateTripReport('t1'); });

      expect(result.current.remaining).toBe(4);
    });

    it('sets an error and does not throw when the trip is not found', async () => {
      const container = createTestContainer();
      const { result } = renderHook(() => useGenerateReport(), { wrapper: makeWrapper(container) });

      let success: boolean | undefined;
      await act(async () => { success = await result.current.generateTripReport('missing-trip'); });

      expect(success).toBe(false);
      expect(result.current.error).toContain('not found');
    });
  });

  describe('generateGroupReport', () => {
    it('merges direct group expenses with the group\'s trip expenses for the selected month', async () => {
      const group = groupFactory({
        id: 'g1',
        name: 'Flatmates',
        members: [groupMemberFactory({ userId: 'u1', displayName: 'Alice' }), groupMemberFactory({ userId: 'u2', displayName: 'Bob' })],
      });
      const trip = tripFactory({
        id: 't1', name: 'Weekend Getaway', groupId: 'g1',
        members: [memberFactory({ userId: 'u1', displayName: 'Alice' }), memberFactory({ userId: 'u2', displayName: 'Bob' })],
      });
      const month = new Date('2026-03-10T00:00:00Z');
      const expenseRepo = new InMemoryExpenseRepository().seed([
        expenseFactory({ id: 'e-direct', groupId: 'g1', tripId: undefined, description: 'Rent', createdAt: month }),
        expenseFactory({ id: 'e-trip', tripId: 't1', groupId: undefined, description: 'Groceries', createdAt: month }),
      ]);
      const splitRequestRepo = new InMemorySplitRequestRepository();
      const container = createTestContainer({ expenseRepo, splitRequestRepo });
      const storeApi = container.resolve(TRIP_STORE);
      storeApi.getState().appendGroup(group);
      storeApi.getState().appendTrip(trip);

      const { result } = renderHook(() => useGenerateReport(), { wrapper: makeWrapper(container) });

      let success: boolean | undefined;
      await act(async () => { success = await result.current.generateGroupReport('g1', month); });

      expect(success).toBe(true);
      const Print = require('expo-print') as { printToFileAsync: jest.Mock };
      const html  = (Print.printToFileAsync.mock.calls[0][0] as { html: string }).html;
      expect(html).toContain('Rent');
      expect(html).toContain('Groceries');
      // Groceries came from the "Weekend Getaway" trip — it should render
      // under that trip's heading, not silently mixed in with direct expenses.
      expect(html).toContain('Weekend Getaway');
    });

    it('does not generate when the rate limit is exceeded', async () => {
      const group = groupFactory({ id: 'g1', members: [groupMemberFactory()] });
      const container = createTestContainer();
      container.resolve(TRIP_STORE).getState().appendGroup(group);
      const reportService = container.resolve(require('../../../core/di/tokens').REPORT_SERVICE) as MockReportService;
      reportService.callCount = reportService.maxCalls;

      const { result } = renderHook(() => useGenerateReport(), { wrapper: makeWrapper(container) });

      let success: boolean | undefined;
      await act(async () => { success = await result.current.generateGroupReport('g1', new Date()); });

      expect(success).toBe(false);
      const Print = require('expo-print') as { printToFileAsync: jest.Mock };
      expect(Print.printToFileAsync).not.toHaveBeenCalled();
    });
  });
});
