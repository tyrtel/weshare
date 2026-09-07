import React from 'react';
import { View, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Text } from '../../../components/ui/Text';
import { useColors } from '../../../theme/colors';
import { formatCurrency } from '../../../core/utils/formatCurrency';
import { makeExpenseFormStyles } from '../screens/expenseFormStyles';
import { useTranslation } from 'react-i18next';

interface ExpenseSummaryHeaderProps {
  description: string;
  totalAmountCents: number;
  currency: string;
  itemCount: number;
  onPress: () => void;
}

// Add-flow, step 2 only: a compact, read-only recap of what was entered on
// step 1 — the editable amount card is gone from this step, so this is the
// only place the total/name are still visible. Tapping it goes back to step 1.
export function ExpenseSummaryHeader({ description, totalAmountCents, currency, itemCount, onPress }: ExpenseSummaryHeaderProps) {
  const { t } = useTranslation();
  const colors = useColors();
  const styles = makeExpenseFormStyles(colors);

  return (
    <Pressable
      testID="expense-summary-header"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('expenses.form.edit_details_label')}
      style={[styles.card, { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }]}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text.primary }} numberOfLines={1}>
          {description || t('expenses.form.title_placeholder')}
        </Text>
        <Text style={{ fontSize: 12, color: colors.text.tertiary, marginTop: 2 }}>
          {itemCount > 0
            ? t('expenses.form.summary_item_count', { count: itemCount })
            : t('expenses.form.edit_details_label')}
        </Text>
      </View>
      <Text style={{ fontFamily: styles.amountInput.fontFamily, fontSize: 20, color: colors.text.primary }}>
        {formatCurrency(totalAmountCents, currency)}
      </Text>
      <Feather name="edit-2" size={14} color={colors.text.tertiary} />
    </Pressable>
  );
}
