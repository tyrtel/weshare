import React, { createContext, useContext, useMemo } from 'react';
import { useTripSessionStore } from '../core/di/ServiceContext';
import { selectSplitRequests } from '../store/selectors';
import type { SplitRequest } from '../core/models/SplitRequest';

const ACTIVE_STATUSES = new Set<SplitRequest['status']>([
  'created', 'request_sent', 'authorized', 'pending', 'owed',
]);

interface PaymentContextValue {
  /** All SplitRequests for the current trip. */
  splitRequests: SplitRequest[];
  /** Only SplitRequests that are in a non-terminal, active state. */
  activeSplitRequests: SplitRequest[];
}

const PaymentContext = createContext<PaymentContextValue | null>(null);

interface PaymentProviderProps {
  tripId:   string;
  children: React.ReactNode;
}

export function PaymentProvider({ tripId, children }: PaymentProviderProps) {
  const splitRequests = useTripSessionStore((s) => selectSplitRequests(s, tripId));

  const activeSplitRequests = useMemo(
    () => splitRequests.filter((r) => ACTIVE_STATUSES.has(r.status)),
    [splitRequests],
  );

  const value = useMemo(
    () => ({ splitRequests, activeSplitRequests }),
    [splitRequests, activeSplitRequests],
  );

  return <PaymentContext.Provider value={value}>{children}</PaymentContext.Provider>;
}

export function usePaymentContext(): PaymentContextValue {
  const ctx = useContext(PaymentContext);
  if (!ctx) throw new Error('usePaymentContext must be used inside <PaymentProvider>');
  return ctx;
}
