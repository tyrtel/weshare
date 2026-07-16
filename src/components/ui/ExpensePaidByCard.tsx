import React from 'react';
import { View, StyleSheet } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { Text } from './Text';
import { Avatar } from './Avatar';
import { useColors } from '../../theme/colors';
import { ledgerRadius, ledgerShadow } from '../../theme/tokens';
import { getInitials } from '../../core/utils/getInitials';

interface ExpensePaidByCardProps {
  payerName: string;
  payerColor: string;
  avatarUrl?: string;
  label: string;
  style?: StyleProp<ViewStyle>;
}

export function ExpensePaidByCard({ payerName, payerColor, avatarUrl, label, style }: ExpensePaidByCardProps) {
  const colors = useColors();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center' }, style]}>
      <Avatar initials={getInitials(payerName)} bg={payerColor} url={avatarUrl} size="md" />
      <View style={{ marginLeft: 12 }}>
        <Text style={[styles.fieldLabel, { color: colors.text.secondary }]}>{label}</Text>
        <Text variant="body">{payerName}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: ledgerRadius.card,
    padding: 16,
    ...ledgerShadow.card,
  },
  fieldLabel: {
    fontSize: 12, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8,
  },
});
