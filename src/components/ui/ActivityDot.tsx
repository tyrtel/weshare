import React from 'react';
import { View } from 'react-native';
import { useColors } from '../../theme/colors';

export function ActivityDot() {
  const colors = useColors();
  return (
    <View
      style={{
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: colors.butter,
      }}
    />
  );
}
