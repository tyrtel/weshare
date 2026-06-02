import React from 'react';
import { View, ScrollView, Pressable } from 'react-native';
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
  const { id } = useLocalSearchParams<{ id: string }>();
  const router  = useRouter();
  const colors  = useColors();

  const { trip, expenses, loading } = useTripDetail(id);

  const totalCents = expenses.reduce((s, e) => s + e.totalAmountCents, 0);

  const handleExpensePress = (expense: Expense) => router.push(`/expense/${expense.id}`);

  if (loading || !trip) return <ScreenWrapper />;

  return (
    <ScreenWrapper>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        contentContainerStyle={{
          padding: tokens.spacing.md,
          paddingBottom: tokens.spacing.xxl + TAB_BAR_HEIGHT,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: tokens.spacing.lg }}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Back"
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
            Total trip spend
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
            {expenses.length} {expenses.length === 1 ? 'expense' : 'expenses'} · {trip.currency}
          </Text>
        </View>

        {/* Who paid — pie chart */}
        <SpendPieChart
          expenses={expenses}
          members={trip.members}
          currency={trip.currency}
        />

        {/* All activity */}
        <Text
          variant="label"
          color={colors.text.secondary}
          style={{ marginBottom: tokens.spacing.sm, marginTop: tokens.spacing.xs }}
        >
          All Activity
        </Text>

        {expenses.length === 0 ? (
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: tokens.radius.md,
              padding: tokens.spacing.lg,
              alignItems: 'center',
            }}
          >
            <Text variant="body" color={colors.text.secondary}>No expenses recorded yet.</Text>
          </View>
        ) : (
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: tokens.radius.md,
              paddingHorizontal: tokens.spacing.md,
              ...tokens.shadow.sm,
            }}
          >
            {expenses.map((expense, i) => (
              <ExpenseRow
                key={expense.id}
                expense={expense}
                members={trip.members}
                index={i}
                onPress={handleExpensePress}
                showDivider={i < expenses.length - 1}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </ScreenWrapper>
  );
}
