import React from 'react';
import { View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BalanceSummaryScreen } from '../../src/features/balance/screens/BalanceSummaryScreen';
import { useActiveTheme, useSetTheme } from '../../src/core/ThemeContext';
import { Text } from '../../src/components/ui/Text';
import { ledgerColors } from '../../src/theme/colors';
import { useColors } from '../../src/theme/colors';

export default function BalanceTab() {
  const theme = useActiveTheme();
  const setTheme = useSetTheme();
  const colors = useColors();
  const isLedger = theme === 'ledger';

  return (
    <View style={{ flex: 1 }}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: isLedger ? ledgerColors.surface : colors.surface }}>
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderBottomColor: isLedger ? ledgerColors.border : colors.border,
        }}>
          <Text style={{ fontSize: 13, color: isLedger ? ledgerColors.text.secondary : colors.text.secondary }}>
            Theme
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable
              onPress={() => setTheme('default')}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 5,
                borderRadius: 999,
                backgroundColor: !isLedger ? colors.primary.default : colors.border,
              }}
            >
              <Text style={{ fontSize: 12, color: !isLedger ? '#fff' : colors.text.secondary }}>Default</Text>
            </Pressable>
            <Pressable
              onPress={() => setTheme('ledger')}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 5,
                borderRadius: 999,
                backgroundColor: isLedger ? ledgerColors.primary.default : colors.border,
              }}
            >
              <Text style={{ fontSize: 12, color: isLedger ? '#fff' : colors.text.secondary }}>Ledger</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
      <BalanceSummaryScreen />
    </View>
  );
}
