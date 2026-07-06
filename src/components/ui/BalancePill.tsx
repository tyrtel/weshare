import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ledgerColors } from '../../theme/colors';
import { ledgerRadius, ledgerFonts } from '../../theme/tokens';
import { formatCurrency } from '../../core/utils/formatCurrency';

interface BalancePillProps {
  cents: number;
  currency?: string;
}

export function BalancePill({ cents, currency = 'EUR' }: BalancePillProps) {
  const isOwed = cents >= 0;
  const sign = isOwed ? '+' : '−';
  const amount = formatCurrency(Math.abs(cents), currency);

  return (
    <View style={[
      styles.pill,
      { backgroundColor: isOwed ? ledgerColors.success.bg : ledgerColors.error.bg },
    ]}>
      <Text style={[
        styles.text,
        { color: isOwed ? ledgerColors.success.default : ledgerColors.error.default },
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
    alignSelf: 'flex-start',
  },
  text: {
    fontFamily: ledgerFonts.displaySemibold,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
});
