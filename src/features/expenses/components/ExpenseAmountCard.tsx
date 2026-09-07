import React from 'react';
import { View, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Text } from '../../../components/ui/Text';
import { useColors } from '../../../theme/colors';
import { currencySymbol } from '../../../core/constants/currencies';
import { formatCurrency, formatRate } from '../../../core/utils/formatCurrency';
import { makeExpenseFormStyles } from '../screens/expenseFormStyles';
import { useTranslation } from 'react-i18next';
import type { UseCurrencyRateReturn } from '../hooks/useCurrencyRate';

interface ExpenseAmountCardProps {
  currency: string;
  // Editable single-amount entry (default add-step-1/edit), or a read-only
  // running total (add-step-1 while broken into items — the total is derived
  // from the line items, not typed directly).
  amount:
    | { editable: true; rawAmount: string; onChangeAmount: (raw: string) => void }
    | { editable: false; totalCents: number };
  onPressCurrency: () => void;
  description: string;
  onChangeDescription: (v: string) => void;
  isForeign: boolean;
  rate: UseCurrencyRateReturn;
  entryCurrency: string;
  contextCurrency: string;
  convertedCents: number;
}

export function ExpenseAmountCard({
  currency, amount, onPressCurrency, description, onChangeDescription,
  isForeign, rate, entryCurrency, contextCurrency, convertedCents,
}: ExpenseAmountCardProps) {
  const { t } = useTranslation();
  const colors = useColors();
  const styles = makeExpenseFormStyles(colors);

  return (
    <View style={styles.card}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 60 }}>
        <Pressable
          onPress={onPressCurrency}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
          hitSlop={8}
        >
          <Text style={styles.currency}>{currencySymbol(currency)}</Text>
          <Feather name="chevron-down" size={14} color={colors.text.tertiary} />
        </Pressable>
        {amount.editable ? (
          <TextInput
            testID="expense-amount-input"
            style={styles.amountInput}
            value={amount.rawAmount}
            onChangeText={amount.onChangeAmount}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={colors.text.tertiary}
          />
        ) : (
          <Text testID="expense-itemized-total" style={styles.amountInput}>
            {formatCurrency(amount.totalCents, currency)}
          </Text>
        )}
      </View>
      {isForeign && (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 6 }}>
          {rate.loading ? (
            <>
              <ActivityIndicator size="small" color={colors.text.tertiary} />
              <Text style={styles.rateText}>{t('expenses.form.rate_fetching')}</Text>
            </>
          ) : rate.error ? (
            <>
              <Feather name="alert-triangle" size={12} color={colors.warning.default} />
              <Text style={[styles.rateText, { color: colors.warning.default }]}>{t('expenses.form.rate_unavailable')}</Text>
              <Pressable onPress={rate.refresh} hitSlop={8}>
                <Text style={[styles.rateText, { color: colors.primary.default, fontWeight: '600' }]}>{t('common.retry')}</Text>
              </Pressable>
            </>
          ) : rate.result ? (
            <Text style={styles.rateText}>
              {`1 ${entryCurrency} = ${formatRate(rate.result.rate)} ${contextCurrency}${convertedCents > 0 ? ` · ${formatCurrency(convertedCents, contextCurrency)}` : ''}${rate.result.source === 'approximate' ? ' · approx.' : ''}`}
            </Text>
          ) : null}
        </View>
      )}
      <TextInput
        testID="expense-description-input"
        style={styles.titleInput}
        value={description}
        onChangeText={onChangeDescription}
        placeholder={t('expenses.form.title_placeholder')}
        placeholderTextColor={colors.text.tertiary}
      />
    </View>
  );
}
