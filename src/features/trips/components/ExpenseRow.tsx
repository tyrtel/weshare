import React from 'react';
import { View, Pressable, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../../../components/ui/Text';
import { Avatar } from '../../../components/ui/Avatar';
import { Divider } from '../../../components/ui/Divider';
import { personColors } from '../../../theme/colors';
import { useColors } from '../../../theme/colors';
import { tokens } from '../../../theme/tokens';
import { formatCurrency } from '../../../core/utils/formatCurrency';
import { categoryById } from '../../expenses/utils/categories';
import type { Expense } from '../../../core/models/Expense';
import type { TripMember } from '../../../core/models/TripMember';

interface ExpenseRowProps {
  expense: Expense;
  members: TripMember[];
  index?: number;
  onPress?: (expense: Expense) => void;
  showDivider?: boolean;
}


function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function ExpenseRow({ expense, members, index = 0, onPress, showDivider = true }: ExpenseRowProps) {
  const { t } = useTranslation();
  const colors = useColors();
  const entering = Platform.OS !== 'web'
    ? FadeInDown.delay(index * 50).duration(300).springify()
    : undefined;
  const exiting = Platform.OS !== 'web'
    ? FadeOutUp.duration(200).springify()
    : undefined;

  const payer = members.find(m => m.userId === expense.paidByUserId);
  const payerName = payer?.displayName ?? t('common.unknown_user');
  const payerIndex = members.findIndex(m => m.userId === expense.paidByUserId);
  const palette = personColors[Math.max(0, payerIndex) % personColors.length];
  const category = categoryById(expense.metadata.category);

  const content = (
    <Animated.View entering={entering} exiting={exiting} style={{ paddingVertical: tokens.spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Avatar
          initials={getInitials(payerName)}
          bg={palette.bg}
          url={payer?.avatarUrl}
          size="sm"
        />
        <View style={{ flex: 1, marginLeft: tokens.spacing.sm }}>
          <Text variant="body" numberOfLines={1}>
            {expense.description}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
            {category && (
              <Ionicons name={category.icon as any} size={11} color={colors.text.tertiary} />
            )}
            <Text variant="caption" color={colors.text.secondary}>
              {t('trips.expense_row.paid_by', { name: payerName })}
            </Text>
          </View>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text variant="label" color={colors.primary.default}>
            {formatCurrency(expense.totalAmountCents, expense.currency)}
          </Text>
          {expense.metadata.originalAmount && (
            <Text variant="caption" color={colors.text.tertiary}>
              {formatCurrency(
                expense.metadata.originalAmount.amountCents,
                expense.metadata.originalAmount.currency,
              )}
            </Text>
          )}
        </View>
      </View>
      {showDivider && <Divider style={{ marginTop: tokens.spacing.sm }} />}
    </Animated.View>
  );

  if (onPress) {
    return (
      <Pressable onPress={() => onPress(expense)} accessibilityRole="button">
        {content}
      </Pressable>
    );
  }

  return content;
}
