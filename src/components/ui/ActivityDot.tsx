import React from 'react';
import { View } from 'react-native';
import { ledgerColors } from '../../theme/colors';

export function ActivityDot() {
  return (
    <View
      style={{
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: ledgerColors.butter,
      }}
    />
  );
}
