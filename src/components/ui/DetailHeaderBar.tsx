import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from './Text';
import { ledgerColors } from '../../theme/colors';
import { ledgerFonts } from '../../theme/tokens';

interface DetailHeaderBarProps {
  title: string;
  onBack: () => void;
  actionIcon: React.ComponentProps<typeof Feather>['name'];
  actionIconSize?: number;
  onAction: () => void;
}

export function DetailHeaderBar({ title, onBack, actionIcon, actionIconSize = 20, onAction }: DetailHeaderBarProps) {
  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: ledgerColors.background }}>
      <View style={styles.titleRow}>
        <Pressable onPress={onBack} hitSlop={10}>
          <Feather name="chevron-left" size={26} color={ledgerColors.text.primary} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        <Pressable onPress={onAction} hitSlop={10}>
          <Feather name={actionIcon} size={actionIconSize} color={ledgerColors.text.secondary} />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12,
  },
  title: { fontFamily: ledgerFonts.display, fontSize: 20, color: ledgerColors.text.primary, letterSpacing: -0.3, flex: 1, textAlign: 'center' },
});
