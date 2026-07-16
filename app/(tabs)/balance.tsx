import React from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BalanceSummaryScreen } from '../../src/features/balance/screens/BalanceSummaryScreen';
import { useColors } from '../../src/theme/colors';

export default function BalanceTab() {
  const colors = useColors();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.surface }}>
        <View style={{
          height: 1,
          backgroundColor: colors.border,
        }} />
      </SafeAreaView>
      <BalanceSummaryScreen />
    </View>
  );
}
