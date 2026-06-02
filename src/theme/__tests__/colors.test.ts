// Test the pure getColors(scheme) selector — no react-native mock required.
// useColors() is a thin wrapper around getColors(useColorScheme()); the hook
// itself is tested implicitly through the component snapshot tests.

import { getColors, darkColors, lightColors, personColors } from '../colors';

describe('getColors()', () => {
  it('returns dark palette for scheme "dark"', () => {
    expect(getColors('dark')).toBe(darkColors);
  });

  it('returns dark palette for null (no system preference)', () => {
    expect(getColors(null)).toBe(darkColors);
  });

  it('returns dark palette for undefined', () => {
    expect(getColors(undefined)).toBe(darkColors);
  });

  it('returns light palette for scheme "light"', () => {
    expect(getColors('light')).toBe(lightColors);
  });

  it('dark background is the design-system navy #1a1a2e', () => {
    expect(darkColors.background).toBe('#1a1a2e');
  });

  it('primary teal is #1D9E75 in both schemes', () => {
    expect(darkColors.primary.default).toBe('#1D9E75');
    expect(lightColors.primary.default).toBe('#1D9E75');
  });

  it('dark palette has distinct surface and background', () => {
    expect(darkColors.surface).not.toBe(darkColors.background);
  });

  it('light palette has white surface', () => {
    expect(lightColors.surface).toBe('#ffffff');
  });
});

describe('personColors', () => {
  it('exports 8 color pairs', () => {
    expect(personColors).toHaveLength(8);
  });

  it('every pair has bg and text', () => {
    personColors.forEach((p) => {
      expect(typeof p.bg).toBe('string');
      expect(typeof p.text).toBe('string');
    });
  });
});
