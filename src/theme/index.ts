export { tokens, spacing, radius, fontSize, fontWeight, shadow, pillStack } from './tokens';
export { useColors, getColors, darkColors, lightColors, personColors, personColorFor } from './colors';
export type { ColorPalette, PersonColor } from './colors';
export { typography } from './typography';
export type { TypographyVariant, TypographyStyle } from './typography';

import { tokens } from './tokens';
import { useColors } from './colors';
import { typography } from './typography';

export function useTheme() {
  const colors = useColors();
  return { colors, tokens, typography };
}
