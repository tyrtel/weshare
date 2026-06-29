import React from 'react';
import { View, ScrollView, ActivityIndicator, Pressable, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '../../../src/components/ui/ScreenWrapper';
import { TAB_BAR_HEIGHT } from '../../../src/components/ui/UniversalTabBar';
import { Text } from '../../../src/components/ui/Text';
import { Badge } from '../../../src/components/ui/Badge';
import { Avatar } from '../../../src/components/ui/Avatar';
import { Divider } from '../../../src/components/ui/Divider';
import { Card } from '../../../src/components/ui/Card';
import { useSettleGroupExpense } from '../../../src/features/groups/hooks/useSettleGroupExpense';
import { useTripSessionStore } from '../../../src/core/di/ServiceContext';
import { useColors } from '../../../src/theme/colors';
import { personColors } from '../../../src/theme/colors';
import { tokens } from '../../../src/theme/tokens';
import { formatCurrency } from '../../../src/core/utils/formatCurrency';

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export default function GroupExpenseDetailScreen() {
  const { t }                                       = useTranslation();
  const router                                      = useRouter();
  const colors                                      = useColors();
  const { id, groupId }                             = useLocalSearchParams<{ id: string; groupId: string }>();
  const { settleGroupExpense, loading: settling }   = useSettleGroupExpense();

  const expense = useTripSessionStore(s =>
    (s.groupExpenses[groupId] ?? []).find(e => e.id === id),
  );

  const group = useTripSessionStore(s => s.groups.find(g => g.id === groupId));

  if (!expense || !group) {
    return (
      <ScreenWrapper>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: tokens.spacing.lg }}>
          <ActivityIndicator color={colors.primary.default} size="large" />
        </View>
      </ScreenWrapper>
    );
  }

  const settled = !!expense.settledAt;

  const memberMap = new Map(group.members.map(m => [m.userId, m]));
  const payer     = memberMap.get(expense.paidByUserId);
  const payerName = payer?.displayName ?? 'Unknown';

  const handleSettle = () => {
    Alert.alert(
      t('groups.expense.settle_title'),
      t('groups.expense.settle_message'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('groups.expense.settle_confirm'),
          onPress: async () => {
            const ok = await settleGroupExpense(expense.id, groupId);
            if (ok && router.canGoBack()) router.back();
          },
        },
      ],
    );
  };

  return (
    <ScreenWrapper>
      <Stack.Screen options={{ title: expense.description }} />
      <ScrollView
        contentContainerStyle={{ padding: tokens.spacing.md, paddingBottom: tokens.spacing.md + TAB_BAR_HEIGHT }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ marginBottom: tokens.spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: tokens.spacing.xs }}>
            <Text variant="heading1" style={{ flex: 1 }} numberOfLines={2}>
              {expense.description}
            </Text>
            {settled && (
              <Badge label={t('expenses.detail.settled_badge')} bg={colors.success.bg} color={colors.success.default} />
            )}
          </View>
          <Text variant="heading2" color={colors.primary.default}>
            {formatCurrency(expense.totalAmountCents, expense.currency)}
          </Text>
          <Text variant="caption" color={colors.text.secondary} style={{ marginTop: tokens.spacing.xs }}>
            {expense.createdAt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
          </Text>
        </View>

        {/* Paid by */}
        <Card style={{ marginBottom: tokens.spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Avatar
              initials={getInitials(payerName)}
              bg={personColors[0].text}
              url={payer?.avatarUrl}
              size="md"
            />
            <View style={{ marginLeft: tokens.spacing.sm }}>
              <Text variant="caption" color={colors.text.secondary}>{t('expenses.detail.paid_by_label')}</Text>
              <Text variant="body">{payerName}</Text>
            </View>
          </View>
        </Card>

        {/* Splits */}
        {expense.splits.length > 0 && (
          <View style={{ backgroundColor: colors.surface, borderRadius: tokens.radius.card, padding: tokens.spacing.md, marginBottom: tokens.spacing.md }}>
            <Text variant="label" color={colors.text.secondary} style={{ marginBottom: tokens.spacing.sm }}>
              {t('expenses.detail.split_title', { count: expense.splits.length })}
            </Text>
            {expense.splits.map((split, i) => {
              const member  = memberMap.get(split.userId);
              const name    = member?.displayName ?? split.userId;
              const palette = personColors[i % personColors.length];
              return (
                <View key={split.id}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: tokens.spacing.sm }}>
                    <Avatar initials={getInitials(name)} bg={palette.text} url={member?.avatarUrl} size="sm" />
                    <Text variant="body" style={{ flex: 1, marginLeft: tokens.spacing.sm }} numberOfLines={1}>{name}</Text>
                    <Text variant="label" color={colors.text.primary}>
                      {formatCurrency(split.amountOwedCents, expense.currency)}
                    </Text>
                  </View>
                  {i < expense.splits.length - 1 && <Divider />}
                </View>
              );
            })}
          </View>
        )}

        {/* Settle action */}
        {!settled && (
          <Pressable
            onPress={handleSettle}
            disabled={settling}
            accessibilityRole="button"
            style={({ pressed }) => ({
              backgroundColor: colors.primary.default,
              borderRadius: tokens.radius.md,
              paddingVertical: tokens.spacing.md,
              alignItems: 'center',
              opacity: pressed || settling ? 0.7 : 1,
              marginTop: tokens.spacing.sm,
            })}
          >
            {settling
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text variant="label" color="#ffffff">{t('groups.expense.settle_button')}</Text>}
          </Pressable>
        )}
      </ScrollView>
    </ScreenWrapper>
  );
}
