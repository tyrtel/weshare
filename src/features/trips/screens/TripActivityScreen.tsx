import React from 'react';
import { View, FlatList, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '../../../components/ui/ScreenWrapper';
import { TAB_BAR_HEIGHT } from '../../../components/ui/UniversalTabBar';
import { Text } from '../../../components/ui/Text';
import { ExpenseRow } from '../components/ExpenseRow';
import { SpendPieChart } from '../components/SpendPieChart';
import { useTripDetail } from '../hooks/useTripDetail';
import { formatCurrency } from '../../../core/utils/formatCurrency';
import { useColors } from '../../../theme/colors';
import { tokens } from '../../../theme/tokens';
import type { Expense } from '../../../core/models/Expense';

export function TripActivityScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router  = useRouter();
  const colors  = useColors();

  const { trip, expenses, loading } = useTripDetail(id);

  const totalCents = expenses.reduce((s, e) => s + e.totalAmountCents, 0);

  const handleExpensePress = (expense: Expense) => router.push(`/expense/${expense.id}`);

  if (loading || !trip) return <ScreenWrapper isLoading />;

  const ListHeader = (
    <View style={{ padding: tokens.spacing.md }}>
      {/* Back button + title */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: tokens.spacing.lg }}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          style={{ marginRight: tokens.spacing.sm, padding: tokens.spacing.xs }}
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={22} color={colors.text.secondary} />
        </Pressable>
        <Text variant="heading1" style={{ flex: 1 }} numberOfLines={1}>
          {trip.name}
        </Text>
      </View>

      {/* Total spend card */}
      <View
        style={{
          backgroundColor: colors.surface,
          borderRadius: tokens.radius.card,
          padding: tokens.spacing.lg,
          marginBottom: tokens.spacing.lg,
          alignItems: 'center',
          ...tokens.shadow.sm,
        }}
      >
        <Text variant="label" color={colors.text.secondary} style={{ marginBottom: tokens.spacing.xs }}>
          {t('trips.activity.total_spend_label')}
        </Text>
        <Text
          style={{
            fontSize: 36,
            fontWeight: '700',
            color: colors.text.primary,
            lineHeight: 42,
          }}
        >
          {formatCurrency(totalCents, trip.currency)}
        </Text>
        <Text variant="caption" color={colors.text.tertiary} style={{ marginTop: tokens.spacing.xs }}>
          {t('trips.activity.expense_count', { count: expenses.length, currency: trip.currency })}
        </Text>
      </View>

      {/* Who paid — pie chart */}
      <SpendPieChart
        expenses={expenses}
        members={trip.members}
        currency={trip.currency}
      />

      {/* Section label */}
      <Text
        variant="label"
        color={colors.text.secondary}
        style={{ marginBottom: tokens.spacing.sm, marginTop: tokens.spacing.xs }}
      >
        {t('trips.activity.all_activity_label')}
      </Text>
    </View>
  );

  return (
    <ScreenWrapper>
      <Stack.Screen options={{ headerShown: false }} />
      <FlatList
        data={expenses}
        keyExtractor={item => item.id}
        renderItem={({ item, index }) => (
          <View style={{ paddingHorizontal: tokens.spacing.md }}>
            <ExpenseRow
              expense={item}
              members={trip.members}
              index={index}
              onPress={handleExpensePress}
              showDivider={index < expenses.length - 1}
            />
          </View>
        )}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={
          <View
            style={{
              marginHorizontal: tokens.spacing.md,
              backgroundColor: colors.surface,
              borderRadius: tokens.radius.md,
              padding: tokens.spacing.lg,
              alignItems: 'center',
            }}
          >
            <Text variant="body" color={colors.text.secondary}>{t('trips.activity.empty')}</Text>
          </View>
        }
        contentContainerStyle={{ paddingBottom: tokens.spacing.xxl + TAB_BAR_HEIGHT }}
        showsVerticalScrollIndicator={false}
      />
    </ScreenWrapper>
  );
}
