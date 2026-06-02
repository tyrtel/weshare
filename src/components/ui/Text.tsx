import React from 'react';
import { Text as RNText } from 'react-native';
import type { TextProps as RNTextProps } from 'react-native';
import { useColors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import type { TypographyVariant } from '../../theme/typography';

interface TextProps extends RNTextProps {
  variant?: TypographyVariant;
  color?: string;
}

export function Text({ variant = 'body', color, style, ...props }: TextProps) {
  const colors = useColors();
  return (
    <RNText
      style={[typography[variant], { color: color ?? colors.text.primary }, style]}
      {...props}
    />
  );
}
