import type { SplitRequestStatus } from '../models/SplitRequest';

export interface StatusDisplayConfig {
  label:     string;
  textColor: string;
  bgColor:   string;
}

/**
 * Canonical status → display mapping.
 * Pass the resolved `colors` object from `useColors()` so values
 * remain theme-aware (light/dark mode).
 */
export function getStatusDisplay(
  status: SplitRequestStatus,
  colors: {
    text:       { secondary: string; tertiary: string };
    success:    { default: string; bg: string };
    surfaceAlt: string;
    warning:    { default: string; bg: string };
    error:      { default: string; bg: string };
  },
): StatusDisplayConfig {
  switch (status) {
    case 'owed':         return { label: 'Owes',       textColor: colors.text.secondary,  bgColor: colors.surfaceAlt };
    case 'paid':         return { label: 'Paid',        textColor: colors.success.default, bgColor: colors.success.bg };
    case 'created':      return { label: 'Created',     textColor: colors.text.secondary,  bgColor: colors.surfaceAlt };
    case 'request_sent': return { label: 'Sent',        textColor: '#60a5fa',              bgColor: '#0d1e3a' };
    case 'authorized':   return { label: 'Authorised',  textColor: '#60a5fa',              bgColor: '#0d1e3a' };
    case 'pending':      return { label: 'Pending',     textColor: colors.warning.default, bgColor: colors.warning.bg };
    case 'completed':    return { label: 'Paid',        textColor: colors.success.default, bgColor: colors.success.bg };
    case 'declined':     return { label: 'Declined',    textColor: colors.error.default,   bgColor: colors.error.bg };
    case 'expired':      return { label: 'Expired',     textColor: colors.text.tertiary,   bgColor: colors.surfaceAlt };
  }
}
