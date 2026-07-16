import { getColors, ledgerColors, ledgerDarkColors, personColors } from '../colors';

describe('getColors()', () => {
  it('resolves light scheme to ledgerColors', () => {
    expect(getColors('light')).toBe(ledgerColors);
  });

  it('resolves dark scheme to ledgerDarkColors', () => {
    expect(getColors('dark')).toBe(ledgerDarkColors);
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

  it('ledgerDarkColors palette has distinct surface and background', () => {
    expect(ledgerDarkColors.surface).not.toBe(ledgerDarkColors.background);
  });

  it('ledgerDarkColors is a tonal twin, not the same palette as ledgerColors', () => {
    expect(ledgerDarkColors.background).not.toBe(ledgerColors.background);
    expect(ledgerDarkColors.text.primary).not.toBe(ledgerColors.text.primary);
  });

  it('both palettes define the same semantic keys', () => {
    expect(Object.keys(ledgerDarkColors).sort()).toEqual(Object.keys(ledgerColors).sort());
    expect(Object.keys(ledgerDarkColors.text).sort()).toEqual(Object.keys(ledgerColors.text).sort());
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
