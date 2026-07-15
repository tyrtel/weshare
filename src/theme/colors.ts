// Full light + dark palette.
//
// Design system rule: ALL colored surfaces use a very dark desaturated background
// with a bright/pastel text color of the same hue. Never use a light background for
// user-generated colored content (person cards, item pills).
//
// Primary accent: #1D9E75 (teal family).
// Dark is the primary scheme; light mode is supported but secondary.

import { useColorScheme as _useColorScheme } from 'react-native'; // kept for getColors() signature compat

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
    tertiary: '#7a7a99',
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
    tertiary: '#7b8299',
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

// ── Ledger palette ────────────────────────────────────────────────────────────

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

  simulation: {
    bg: '#fff8e1',
    text: '#b45309',
  },

  butter: '#F2C94C',
} as const;

// ── Person / data-viz colors ──────────────────────────────────────────────────
// ColorBrewer Dark2 qualitative palette (colorbrewer2.org).
// Text values are the canonical Dark2 hex codes; bg values are very-dark
// same-hue surfaces matching the design rule "dark surface, bright text".

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

export type ColorPalette = typeof darkColors | typeof lightColors | typeof ledgerColors;

// ── Pure selector (kept for backward-compat; ignores scheme — always ledger) ─

export function getColors(_scheme: string | null | undefined): ColorPalette {
  return ledgerColors;
}

// ── Hook — always returns the single ledger (PoCUI light) palette ─────────────

export function useColors(): ColorPalette {
  _useColorScheme(); // keeps the hook call count stable across renders
  return ledgerColors;
}
