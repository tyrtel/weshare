import React from 'react';
import { Text, TextStyle, StyleProp } from 'react-native';
import { ledgerFonts } from '../../theme/tokens';

type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl';

const sizeMap: Record<Size, number> = {
  xs: 11,
  sm: 13,
  md: 16,
  lg: 20,
  xl: 28,
  xxl: 38,
};

interface MoneyProps {
  children: string;
  size?: Size;
  color?: string;
  semibold?: boolean;
  style?: StyleProp<TextStyle>;
}

export function Money({ children, size = 'md', color, semibold = false, style }: MoneyProps) {
  return (
    <Text
      style={[
        {
          fontFamily: semibold ? ledgerFonts.displaySemibold : ledgerFonts.display,
          fontSize: sizeMap[size],
          fontVariant: ['tabular-nums'],
          color,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
