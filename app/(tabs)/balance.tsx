import React from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BalanceSummaryScreen } from '../../src/features/balance/screens/BalanceSummaryScreen';
import { ledgerColors } from '../../src/theme/colors';

export default function BalanceTab() {
  return (
    <View style={{ flex: 1, backgroundColor: ledgerColors.background }}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: ledgerColors.surface }}>
        <View style={{
          height: 1,
          backgroundColor: ledgerColors.border,
        }} />
      </SafeAreaView>
      <BalanceSummaryScreen />
    </View>
  );
}
