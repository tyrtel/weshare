import React from 'react';
import { View } from 'react-native';
import { Text } from './Text';
import { useColors } from '../../theme/colors';
import { tokens } from '../../theme/tokens';

interface BadgeProps {
  label: string;
  bg?: string;
  color?: string;
}

export function Badge({ label, bg, color }: BadgeProps) {
  const colors = useColors();

  return (
    <View
      style={{
        backgroundColor: bg ?? colors.primary.subtle,
        borderRadius: tokens.radius.pill,
        paddingHorizontal: tokens.spacing.sm,
        paddingVertical: 2,
        alignSelf: 'flex-start',
      }}
    >
      <Text variant="caption" color={color ?? colors.primary.light}>
        {label}
      </Text>
    </View>
  );
}
