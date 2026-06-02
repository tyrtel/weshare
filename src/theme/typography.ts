// Text variant definitions. Each variant specifies size, weight, and line height.
// Used by the Text component and the useTheme() hook.

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
  heading1: { fontSize: 30, fontWeight: '700', lineHeight: 36 },
  heading2: { fontSize: 24, fontWeight: '700', lineHeight: 30 },
  heading3: { fontSize: 20, fontWeight: '600', lineHeight: 26 },
  body: { fontSize: 15, fontWeight: '400', lineHeight: 22 },
  caption: { fontSize: 11, fontWeight: '400', lineHeight: 16 },
  label: { fontSize: 13, fontWeight: '500', lineHeight: 18 },
  mono: { fontSize: 13, fontWeight: '400', lineHeight: 18, fontFamily: 'monospace' },
};
