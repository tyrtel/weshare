import React from 'react';
import { View, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Text } from '../../../components/ui/Text';
import { useColors } from '../../../theme/colors';
import { currencySymbol } from '../../../core/constants/currencies';
import { formatCurrency, formatRate } from '../../../core/utils/formatCurrency';
import type { ExpenseFormStyles } from '../screens/expenseFormStyles';
import { useTranslation } from 'react-i18next';
import type { UseCurrencyRateReturn } from '../hooks/useCurrencyRate';

interface ExpenseAmountCardProps {
  currency: string;
  rawAmount: string;
  onChangeAmount: (raw: string) => void;
  onPressCurrency: () => void;
  description: string;
  onChangeDescription: (v: string) => void;
  isForeign: boolean;
  rate: UseCurrencyRateReturn;
  entryCurrency: string;
  contextCurrency: string;
  convertedCents: number;
  styles: ExpenseFormStyles;
}

export function ExpenseAmountCard({
  currency, rawAmount, onChangeAmount, onPressCurrency, description, onChangeDescription,
  isForeign, rate, entryCurrency, contextCurrency, convertedCents, styles,
}: ExpenseAmountCardProps) {
  const { t } = useTranslation();
  const colors = useColors();

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
        <TextInput
          testID="expense-amount-input"
          style={styles.amountInput}
          value={rawAmount}
          onChangeText={onChangeAmount}
          keyboardType="decimal-pad"
          placeholder="0.00"
          placeholderTextColor={colors.text.tertiary}
        />
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
