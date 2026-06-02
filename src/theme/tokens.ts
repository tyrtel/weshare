// Spacing, radius, font sizes, weights, shadows — no hardcoded colors.
// These are referenced by all UI components and feature screens.

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  badge: 10,   // initials badge (small rounded square)
  card: 18,    // person buckets, cards
  pill: 22,    // item pills, chips, buttons
  full: 9999,
} as const;

export const fontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
  xxxl: 30,
} as const;

export const fontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
};

export const shadow = {
  sm: {
    boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.15)',
    elevation: 2,
  },
  md: {
    boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.20)',
    elevation: 4,
  },
  lg: {
    boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.25)',
    elevation: 8,
  },
} as const;

// Stacked item-pile layout constants (from design system)
export const pillStack = {
  height: 44,
  overlapOffset: -8,
} as const;

// Convenience object for useTheme()
export const tokens = {
  spacing,
  radius,
  fontSize,
  fontWeight,
  shadow,
  pillStack,
} as const;
