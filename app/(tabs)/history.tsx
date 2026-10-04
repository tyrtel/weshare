import React from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityFeedScreen } from '../../src/features/history/screens/ActivityFeedScreen';
import { useColors } from '../../src/theme/colors';

export default function HistoryTab() {
  const colors = useColors();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.surface }}>
        <View style={{
          height: 1,
          backgroundColor: colors.border,
        }} />
      </SafeAreaView>
      <ActivityFeedScreen />
    </View>
  );
}
