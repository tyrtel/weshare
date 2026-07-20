import { useState, useCallback, useEffect } from 'react';
import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useService } from '../../../core/di/ServiceContext';
import { REPORT_SERVICE, RECEIPT_STORAGE, TRIP_STORE, ENTITLEMENT } from '../../../core/di/tokens';
import type { EntitlementStatus } from '../../../core/models/Entitlement';
import { generateReportHTML } from '../../../core/utils/generateReportHTML';
import { buildTripReportData } from '../utils/buildTripReportData';
import { buildGroupReportData } from '../utils/buildGroupReportData';

const RATE_LIMIT_MESSAGE = "You've reached today's limit of 5 reports. Try again tomorrow.";

export function useGenerateReport() {
  const reportService  = useService(REPORT_SERVICE);
  const receiptStorage = useService(RECEIPT_STORAGE);
  const storeApi       = useService(TRIP_STORE);
  const entitlement    = useService(ENTITLEMENT);

  const [generating, setGenerating] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  // check_report_rate_limit's own remaining (an abuse guard, resets daily —
  // independent of the monetization cap below, same relationship as OCR's
  // rate limiter vs. its lifetime scan cap; see TODO_monetization.md).
  const [remaining, setRemaining]   = useState<number | null>(null);
  // Set instead of `error` when increment_usage_if_allowed rejected the
  // export for having hit the free-tier lifetime cap (TODO_monetization.md
  // Chunk F) — the caller shows a paywall for this case, not the rate-limit
  // banner. limitReachedTripId carries which trip (if any) was being
  // exported, so a Trip Pass purchased from that paywall applies to it.
  const [limitReached, setLimitReached]             = useState(false);
  const [limitReachedTripId, setLimitReachedTripId] = useState<string | undefined>(undefined);
  // Not read directly — refreshing it and re-storing it is just this hook's
  // re-render trigger for the entitlement service's own mutable cache
  // (mirrors PaywallSheet/ReceiptCapture's identical pattern).
  // remainingFreeExports/hasFullAccess below always read live off the
  // service, not off `entitlementStatus`.
  const [, setEntitlementStatus] = useState<EntitlementStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    void entitlement.refresh().then(() => { if (!cancelled) setEntitlementStatus(entitlement.getStatus()); });
    return () => { cancelled = true; };
  }, [entitlement]);

  const clearLimitReached = useCallback(() => {
    setLimitReached(false);
    void entitlement.refresh().then(() => setEntitlementStatus(entitlement.getStatus()));
  }, [entitlement]);

  const remainingFreeExports = entitlement.remainingFreeUses('report_export');
  const hasFullAccess         = entitlement.hasFullAccess();

  const shareReport = async (title: string, html: string): Promise<void> => {
    // expo-print/expo-sharing have no real web implementation: printToFileAsync
    // on web ignores the html argument entirely and just calls window.print()
    // on the CURRENT page (not our generated content), returning no uri at
    // all — so on web, open the actual report HTML in a new tab instead; the
    // browser's own Print > Save as PDF covers the same need there.
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') {
        const win = window.open('', '_blank');
        win?.document.write(html);
        win?.document.close();
      }
      return;
    }
    const { uri } = await Print.printToFileAsync({ html });
    await Sharing.shareAsync(uri, {
      mimeType:    'application/pdf',
      dialogTitle: title,
      UTI:         'com.adobe.pdf',
    });
  };

  const generateTripReport = useCallback(async (tripId: string): Promise<boolean> => {
    setGenerating(true);
    setError(null);
    setLimitReached(false);
    try {
      const usage = await entitlement.consumeUsage('report_export', tripId);
      if (!usage.ok || !usage.value.allowed) {
        setLimitReachedTripId(tripId);
        setLimitReached(true);
        return false;
      }

      const status = await reportService.checkRateLimit();
      setRemaining(status.remaining);
      if (!status.allowed) { setError(RATE_LIMIT_MESSAGE); return false; }

      await Promise.all([
        storeApi.getState().loadTripDetail(tripId),
        storeApi.getState().loadSplitRequests(tripId),
      ]);
      const state = storeApi.getState();
      const trip  = state.trips.find(t => t.id === tripId);
      if (!trip) { setError('Trip not found.'); return false; }

      const expenses      = state.expenses[tripId] ?? [];
      const splitRequests = state.splitRequests[tripId] ?? [];

      const data = await buildTripReportData(trip, expenses, splitRequests, receiptStorage);
      await shareReport(trip.name, generateReportHTML(data));
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate report.');
      return false;
    } finally {
      setGenerating(false);
    }
  }, [reportService, receiptStorage, storeApi, entitlement]);

  const generateGroupReport = useCallback(async (groupId: string, month: Date): Promise<boolean> => {
    setGenerating(true);
    setError(null);
    setLimitReached(false);
    try {
      // Groups have no trip-pass concept — an active subscription or
      // override still bypasses the cap via consumeUsage's own precedence.
      const usage = await entitlement.consumeUsage('report_export');
      if (!usage.ok || !usage.value.allowed) {
        setLimitReachedTripId(undefined);
        setLimitReached(true);
        return false;
      }

      const status = await reportService.checkRateLimit();
      setRemaining(status.remaining);
      if (!status.allowed) { setError(RATE_LIMIT_MESSAGE); return false; }

      await Promise.all([
        storeApi.getState().loadGroupDetail(groupId),
        storeApi.getState().loadSplitRequestsForGroup(groupId),
      ]);

      const groupTrips = storeApi.getState().trips.filter(t => t.groupId === groupId);
      await Promise.all(groupTrips.flatMap(t => [
        storeApi.getState().loadTripDetail(t.id),
        storeApi.getState().loadSplitRequests(t.id),
      ]));

      const state = storeApi.getState();
      const group = state.groups.find(g => g.id === groupId);
      if (!group) { setError('Group not found.'); return false; }

      const allExpenses = [
        ...(state.groupExpenses[groupId] ?? []),
        ...groupTrips.flatMap(t => state.expenses[t.id] ?? []),
      ];
      const allSplitRequests = [
        ...(state.groupSplitRequests[groupId] ?? []),
        ...groupTrips.flatMap(t => state.splitRequests[t.id] ?? []),
      ];

      const data = await buildGroupReportData(group, allExpenses, allSplitRequests, month, receiptStorage, groupTrips);
      await shareReport(group.name, generateReportHTML(data));
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate report.');
      return false;
    } finally {
      setGenerating(false);
    }
  }, [reportService, receiptStorage, storeApi, entitlement]);

  return {
    generating, error, remaining,
    limitReached, limitReachedTripId, clearLimitReached,
    remainingFreeExports, hasFullAccess,
    generateTripReport, generateGroupReport,
  };
}
