// Full light + dark palette.
//
// Design system rule: ALL colored surfaces use a very dark desaturated background
// with a bright/pastel text color of the same hue. Never use a light background for
// user-generated colored content (person cards, item pills).
//
// Primary accent: #1D9E75 (teal family).
// Dark is the primary scheme; light mode is supported but secondary.

import { useColorScheme } from 'react-native';

// ── Dark palette ──────────────────────────────────────────────────────────────

export const darkColors = {
  background: '#1a1a2e',
  surface: '#16213e',
  surfaceAlt: '#0f1627',
  border: '#2a2a4a',
  borderMuted: '#1e1e38',

  text: {
    primary: '#e8e8f5',
    secondary: '#8888aa',
    tertiary: '#5a5a7a',
    inverse: '#1a1a2e',
  },

  primary: {
    default: '#1D9E75',
    light: '#24c28e',
    dim: '#0d7a5a',
    subtle: '#0d2520',
  },

  error: {
    default: '#f87171',
    bg: '#2d1414',
  },

  warning: {
    default: '#fbbf24',
    bg: '#2d2000',
  },

  success: {
    default: '#6ee7b7',
    bg: '#0f2d1a',
  },

  simulation: {
    bg: '#2d2200',
    text: '#fbbf24',
  },
} as const;

// ── Light palette ─────────────────────────────────────────────────────────────

export const lightColors = {
  background: '#f8f9fc',
  surface: '#ffffff',
  surfaceAlt: '#f0f2f8',
  border: '#e2e4ed',
  borderMuted: '#eceef6',

  text: {
    primary: '#1a1a2e',
    secondary: '#6b7280',
    tertiary: '#9ca3af',
    inverse: '#f8f9fc',
  },

  primary: {
    default: '#1D9E75',
    light: '#24c28e',
    dim: '#0d7a5a',
    subtle: '#e6f5f0',
  },

  error: {
    default: '#ef4444',
    bg: '#fef2f2',
  },

  warning: {
    default: '#f59e0b',
    bg: '#fffbeb',
  },

  success: {
    default: '#10b981',
    bg: '#f0fdf4',
  },

  simulation: {
    bg: '#fff8e1',
    text: '#b45309',
  },
} as const;

// ── Person / data-viz colors ──────────────────────────────────────────────────
// ColorBrewer Dark2 qualitative palette (colorbrewer2.org).
// Text values are the canonical Dark2 hex codes; bg values are very-dark
// same-hue surfaces matching the design rule "dark surface, bright text".

export const personColors = [
  { bg: '#0a2520', text: '#1b9e77' }, // teal
  { bg: '#2a1200', text: '#d95f02' }, // orange
  { bg: '#181730', text: '#7570b3' }, // purple
  { bg: '#2a0818', text: '#e7298a' }, // magenta
  { bg: '#152000', text: '#66a61e' }, // green
  { bg: '#261c00', text: '#e6ab02' }, // amber
  { bg: '#201300', text: '#a6761d' }, // brown
  { bg: '#1e1e1e', text: '#888888' }, // grey (lightened slightly for dark-bg contrast)
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
export type ColorPalette = typeof darkColors | typeof lightColors;

// ── Pure selector (testable without mocking react-native) ────────────────────

export function getColors(scheme: string | null | undefined): ColorPalette {
  return scheme === 'light' ? lightColors : darkColors;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useColors(): ColorPalette {
  return getColors(useColorScheme());
}
