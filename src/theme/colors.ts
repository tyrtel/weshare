// Ledger palette (light + dark twin).
//
// Design system rule: ALL colored surfaces use a very dark desaturated background
// with a bright/pastel text color of the same hue. Never use a light background for
// user-generated colored content (person cards, item pills) — this applies in both
// light and dark app themes.
//
// Primary accent: teal-green family (#0E6B4F light / #1FAE7D dark).

import { useResolvedTheme } from '../store/themeStore';

// ── Ledger palette — light (default) ───────────────────────────────────────────

export const ledgerColors = {
  background: '#F2F5F1',
  surface: '#FFFFFF',
  surfaceAlt: '#F2F5F1',
  border: '#E4EAE3',
  borderMuted: '#CBD5CD',

  text: {
    primary: '#182420',
    secondary: '#5C6B63',
    tertiary: '#95A29B',
    inverse: '#FFFFFF',
  },

  primary: {
    default: '#0E6B4F',
    light: '#12946A',
    dim: '#0A4A38',
    subtle: '#E2F1EA',
  },

  error: {
    default: '#D9532B',
    bg: '#FBE7DE',
  },

  warning: {
    default: '#F2C94C',
    bg: '#FFF8E1',
  },

  success: {
    default: '#12946A',
    bg: '#DDF2E9',
  },

  info: {
    default: '#2563EB',
    bg: '#E6EEFB',
  },

  simulation: {
    bg: '#fff8e1',
    text: '#b45309',
  },

  butter: '#F2C94C',
} as const;

// ── Ledger palette — dark twin ──────────────────────────────────────────────────
// Tonal dark twin of ledgerColors: dark desaturated charcoal-green (not the old
// navy/purple design), same teal-green accent family, brightened just enough for
// legibility on dark surfaces.

export const ledgerDarkColors = {
  background: '#0F1613',
  surface: '#171F1B',
  surfaceAlt: '#1C2621',
  border: '#2A3630',
  borderMuted: '#212B26',

  text: {
    primary: '#EAF0EC',
    secondary: '#9BAFA5',
    tertiary: '#6E8479',
    inverse: '#FFFFFF',
  },

  primary: {
    default: '#1FAE7D',
    light: '#3FCB9A',
    dim: '#12946A',
    subtle: '#12251E',
  },

  error: {
    default: '#F0785A',
    bg: '#3A1D14',
  },

  warning: {
    default: '#F2C94C',
    bg: '#332B0E',
  },

  success: {
    default: '#3FCB9A',
    bg: '#12251E',
  },

  info: {
    default: '#60A5FA',
    bg: '#132A47',
  },

  simulation: {
    bg: '#332B0E',
    text: '#F2C94C',
  },

  butter: '#F2C94C',
} as const;

// ── Person / data-viz colors ──────────────────────────────────────────────────
// ColorBrewer Dark2 qualitative palette (colorbrewer2.org).
// Text values are the canonical Dark2 hex codes; bg values are very-dark
// same-hue surfaces matching the design rule "dark surface, bright text".
// Fixed across both themes by design — see rule above.

// Mid-tone solid colours — white text, readable on ledger's mist/paper backgrounds.
export const personColors = [
  { bg: '#2E7D6A', text: '#ffffff' }, // teal
  { bg: '#C2692F', text: '#ffffff' }, // orange
  { bg: '#6557A8', text: '#ffffff' }, // purple
  { bg: '#B83275', text: '#ffffff' }, // magenta
  { bg: '#5C8A1E', text: '#ffffff' }, // green
  { bg: '#B8860A', text: '#ffffff' }, // amber
  { bg: '#8C6B1E', text: '#ffffff' }, // brown
  { bg: '#6B7280', text: '#ffffff' }, // slate
] as const;

export type PersonColor = (typeof personColors)[number];

/**
 * Returns a stable PersonColor for a given userId, keyed off that member's
 * position in the trip's members array. The same person always gets the same
 * color within a trip, and the same color is used across the pie chart,
 * settle-up rows, expense rows, and avatars.
 */
export function personColorFor(
  userId: string,
  members: ReadonlyArray<{ userId: string }>,
): PersonColor {
  const idx = members.findIndex(m => m.userId === userId);
  return personColors[(idx === -1 ? 0 : idx) % personColors.length];
}

export type ColorPalette = typeof ledgerColors | typeof ledgerDarkColors;

// ── Pure selector ────────────────────────────────────────────────────────────

export function getColors(scheme: 'light' | 'dark'): ColorPalette {
  return scheme === 'dark' ? ledgerDarkColors : ledgerColors;
}

// ── Hook — resolves the user's theme preference (light/dark/system) ──────────

export function useColors(): ColorPalette {
  const resolved = useResolvedTheme();
  return getColors(resolved);
}
