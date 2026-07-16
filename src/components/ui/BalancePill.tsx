import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useColors } from '../../theme/colors';
import { ledgerRadius, ledgerFonts } from '../../theme/tokens';
import { formatCurrency } from '../../core/utils/formatCurrency';

interface BalancePillProps {
  cents: number;
  currency?: string;
}

export function BalancePill({ cents, currency = 'EUR' }: BalancePillProps) {
  const colors = useColors();
  const isOwed = cents >= 0;
  const sign = isOwed ? '+' : '−';
  const amount = formatCurrency(Math.abs(cents), currency);

  return (
    <View style={[
      styles.pill,
      { backgroundColor: isOwed ? colors.success.bg : colors.error.bg },
    ]}>
      <Text style={[
        styles.text,
        { color: isOwed ? colors.success.default : colors.error.default },
      ]}>
        {sign}{amount}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: ledgerRadius.pill,
  },
  text: {
    fontFamily: ledgerFonts.displaySemibold,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
});
