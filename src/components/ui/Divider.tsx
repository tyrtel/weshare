import React from 'react';
import { View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { useColors } from '../../theme/colors';

interface DividerProps {
  style?: StyleProp<ViewStyle>;
}

export function Divider({ style }: DividerProps) {
  const colors = useColors();

  return (
    <View
      style={[{ height: 1, backgroundColor: colors.border }, style]}
    />
  );
}
