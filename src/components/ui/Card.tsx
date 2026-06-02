import React from 'react';
import { Pressable, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { useColors } from '../../theme/colors';
import { tokens } from '../../theme/tokens';

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}

export function Card({ children, style, onPress }: CardProps) {
  const colors = useColors();

  const cardStyle: ViewStyle = {
    backgroundColor: colors.surface,
    borderRadius: tokens.radius.card,
    padding: tokens.spacing.md,
    ...tokens.shadow.sm,
  };

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={[cardStyle, style]}>
        {children}
      </Pressable>
    );
  }

  return <View style={[cardStyle, style]}>{children}</View>;
}
