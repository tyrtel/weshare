import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Text } from './Text';
import { useColors } from '../../theme/colors';
import { ledgerRadius, ledgerFonts } from '../../theme/tokens';
import { formatCurrency } from '../../core/utils/formatCurrency';

interface DetailExpenseRowProps {
  description: string;
  payerName: string;
  amountCents: number;
  currency: string;
  metaSuffix?: string;
  onArchivePress?: () => void;
  archiveAccessibilityLabel?: string;
  onPress: () => void;
}

export function DetailExpenseRow({
  description, payerName, amountCents, currency, metaSuffix,
  onArchivePress, archiveAccessibilityLabel, onPress,
}: DetailExpenseRowProps) {
  const colors = useColors();
  return (
    <View style={styles.expenseRow}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.mainArea, { opacity: pressed ? 0.8 : 1 }]}
      >
        <View style={[styles.iconTile, { backgroundColor: colors.primary.subtle }]}>
          <Feather name="file-text" size={16} color={colors.primary.default} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.expTitle, { color: colors.text.primary }]} numberOfLines={1}>{description}</Text>
          <Text style={[styles.expMeta, { color: colors.text.secondary }]}>
            {payerName} paid{metaSuffix ? ` · ${metaSuffix}` : ''}
          </Text>
        </View>
        <Text style={[styles.expAmount, { color: colors.text.primary }]}>{formatCurrency(amountCents, currency)}</Text>
      </Pressable>
      {onArchivePress && (
        <Pressable
          onPress={onArchivePress}
          accessibilityRole="button"
          accessibilityLabel={archiveAccessibilityLabel}
          hitSlop={8}
          style={({ pressed }) => ({ marginLeft: 8, padding: 4, opacity: pressed ? 0.7 : 1 })}
        >
          <Feather name="check-circle" size={20} color={colors.success.default} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  expenseRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  mainArea:   { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconTile:   { width: 36, height: 36, borderRadius: ledgerRadius.sm, alignItems: 'center', justifyContent: 'center' },
  expTitle:   { fontSize: 14.5, fontWeight: '500' },
  expMeta:    { fontSize: 12, marginTop: 2 },
  expAmount:  { fontFamily: ledgerFonts.displaySemibold, fontSize: 15, fontVariant: ['tabular-nums'] },
});
