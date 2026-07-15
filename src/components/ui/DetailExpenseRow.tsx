import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Text } from './Text';
import { ledgerColors } from '../../theme/colors';
import { ledgerRadius, ledgerFonts } from '../../theme/tokens';
import { formatCurrency } from '../../core/utils/formatCurrency';

interface DetailExpenseRowProps {
  description: string;
  payerName: string;
  amountCents: number;
  currency: string;
  metaSuffix?: string;
  onPress: () => void;
}

export function DetailExpenseRow({ description, payerName, amountCents, currency, metaSuffix, onPress }: DetailExpenseRowProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.expenseRow, { opacity: pressed ? 0.8 : 1 }]}
    >
      <View style={styles.iconTile}>
        <Feather name="file-text" size={16} color={ledgerColors.primary.default} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.expTitle} numberOfLines={1}>{description}</Text>
        <Text style={styles.expMeta}>
          {payerName} paid{metaSuffix ? ` · ${metaSuffix}` : ''}
        </Text>
      </View>
      <Text style={styles.expAmount}>{formatCurrency(amountCents, currency)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  expenseRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  iconTile:   { width: 36, height: 36, borderRadius: ledgerRadius.sm, backgroundColor: ledgerColors.primary.subtle, alignItems: 'center', justifyContent: 'center' },
  expTitle:   { fontSize: 14.5, fontWeight: '500', color: ledgerColors.text.primary },
  expMeta:    { fontSize: 12, color: ledgerColors.text.secondary, marginTop: 2 },
  expAmount:  { fontFamily: ledgerFonts.displaySemibold, fontSize: 15, color: ledgerColors.text.primary, fontVariant: ['tabular-nums'] },
});
