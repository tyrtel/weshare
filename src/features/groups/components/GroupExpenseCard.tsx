import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Card } from '../../../components/ui/Card';
import { Text } from '../../../components/ui/Text';
import { Badge } from '../../../components/ui/Badge';
import { useColors } from '../../../theme/colors';
import { tokens } from '../../../theme/tokens';
import { formatCurrency } from '../../../core/utils/formatCurrency';
import type { Expense } from '../../../core/models/Expense';

interface GroupExpenseCardProps {
  expense: Expense;
  payerName: string;
  onPress: (expense: Expense) => void;
}

export function GroupExpenseCard({ expense, payerName, onPress }: GroupExpenseCardProps) {
  const { t } = useTranslation();
  const colors = useColors();
  const settled = !!expense.settledAt;

  return (
    <Card onPress={() => onPress(expense)} style={{ marginBottom: tokens.spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <View style={{ flex: 1, marginRight: tokens.spacing.sm }}>
          <Text variant="body" numberOfLines={1} style={{ opacity: settled ? 0.5 : 1 }}>
            {expense.description}
          </Text>
          <Text variant="caption" color={colors.text.secondary} style={{ marginTop: 2 }}>
            {payerName}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: tokens.spacing.xs }}>
          <Text variant="label" color={settled ? colors.text.tertiary : colors.text.primary}>
            {formatCurrency(expense.totalAmountCents, expense.currency)}
          </Text>
          {settled && (
            <Badge
              label={t('expenses.detail.closed_badge')}
              bg={colors.success.bg}
              color={colors.success.default}
            />
          )}
        </View>
      </View>
    </Card>
  );
}
