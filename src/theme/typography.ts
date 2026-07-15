// Text variant definitions — PoCUI "Ledger" design language.
// Space Grotesk: all headings and money amounts (tabular-nums).
// Inter: body copy, labels, captions.
// Fonts are loaded in app/_layout.tsx.

export type TypographyVariant =
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'body'
  | 'caption'
  | 'label'
  | 'mono';

export type TypographyStyle = {
  fontSize: number;
  fontWeight: '400' | '500' | '600' | '700';
  lineHeight: number;
  fontFamily?: string;
};

export const typography: Record<TypographyVariant, TypographyStyle> = {
  heading1: { fontSize: 30, fontWeight: '700', lineHeight: 36, fontFamily: 'SpaceGrotesk-Bold' },
  heading2: { fontSize: 24, fontWeight: '700', lineHeight: 30, fontFamily: 'SpaceGrotesk-Bold' },
  heading3: { fontSize: 20, fontWeight: '600', lineHeight: 26, fontFamily: 'SpaceGrotesk-SemiBold' },
  body:     { fontSize: 15, fontWeight: '400', lineHeight: 22, fontFamily: 'Inter-Regular' },
  caption:  { fontSize: 11, fontWeight: '400', lineHeight: 16, fontFamily: 'Inter-Regular' },
  label:    { fontSize: 13, fontWeight: '500', lineHeight: 18, fontFamily: 'Inter-Medium' },
  mono:     { fontSize: 13, fontWeight: '700', lineHeight: 18, fontFamily: 'SpaceGrotesk-Bold' },
};
