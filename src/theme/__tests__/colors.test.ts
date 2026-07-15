import { getColors, ledgerColors, personColors } from '../colors';

describe('getColors()', () => {
  it('always returns ledgerColors regardless of scheme', () => {
    expect(getColors('dark')).toBe(ledgerColors);
    expect(getColors('light')).toBe(ledgerColors);
    expect(getColors(null)).toBe(ledgerColors);
    expect(getColors(undefined)).toBe(ledgerColors);
  });

  it('ledger background is mist #F2F5F1', () => {
    expect(ledgerColors.background).toBe('#F2F5F1');
  });

  it('ledger surface is paper #FFFFFF', () => {
    expect(ledgerColors.surface).toBe('#FFFFFF');
  });

  it('ledger primary is spruce #0E6B4F', () => {
    expect(ledgerColors.primary.default).toBe('#0E6B4F');
  });

  it('ledger palette has distinct surface and background', () => {
    expect(ledgerColors.surface).not.toBe(ledgerColors.background);
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
