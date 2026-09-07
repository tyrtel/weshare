import React, { useState, useEffect, useMemo } from 'react';
import { View, ScrollView, ActivityIndicator, Platform, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { SlideInDown } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { z } from 'zod';
import { ScreenWrapper } from '../../../components/ui/ScreenWrapper';
import { TAB_BAR_HEIGHT } from '../../../components/ui/UniversalTabBar';
import { Text } from '../../../components/ui/Text';
import { Avatar } from '../../../components/ui/Avatar';
import { Divider } from '../../../components/ui/Divider';
import { ExpensePaidByCard } from '../../../components/ui/ExpensePaidByCard';
import { ExpenseReceiptSection } from '../../../components/ui/ExpenseReceiptSection';
import { useExpenseDetail } from '../hooks/useExpenseDetail';
import { useService, useTripSessionStore } from '../../../core/di/ServiceContext';
import { MEMBER_REPO, TRIP_STORE } from '../../../core/di/tokens';
import { useColors, personColorFor } from '../../../theme/colors';
import type { ColorPalette } from '../../../theme/colors';
import { ledgerRadius, ledgerShadow, ledgerFonts } from '../../../theme/tokens';
import { confirm } from '../../../core/utils/confirm';
import { formatCurrency, formatRate } from '../../../core/utils/formatCurrency';
import { isOk } from '../../../core/types/Result';
import type { TripMember } from '../../../core/models/TripMember';
import { useTranslation } from 'react-i18next';

const expenseDetailParamsSchema = z.object({
  id: z.string().min(1),
});

export function ExpenseDetailScreen() {
  const { t }  = useTranslation();
  const raw    = useLocalSearchParams();
  const parsed = expenseDetailParamsSchema.safeParse(raw);

  if (!parsed.success) {
    return (
      <ScreenWrapper>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <Text variant="body" style={{ textAlign: 'center' }}>
            {t('expenses.detail.invalid_params')}
          </Text>
        </View>
      </ScreenWrapper>
    );
  }

  return <ExpenseDetailScreenContent id={parsed.data.id} />;
}

function ExpenseDetailScreenContent({ id }: { id: string }) {
  const { t } = useTranslation();
  const router     = useRouter();
  const memberRepo = useService(MEMBER_REPO);
  const storeApi   = useService(TRIP_STORE);
  const colors     = useColors();
  const detailStyles = useMemo(() => makeDetailStyles(colors), [colors]);

  const { expense, loading, error } = useExpenseDetail(id);
  const tripClosed = useTripSessionStore(
    s => s.trips.find(t => t.id === expense?.tripId)?.status === 'closed',
  );
  const [members, setMembers] = useState<TripMember[]>([]);

  useEffect(() => {
    if (!expense) return;
    if (!expense.tripId) return;
    memberRepo.getMembersForTrip(expense.tripId).then(result => {
      if (isOk(result)) setMembers(result.value);
    });
  }, [expense, memberRepo]);

  const handleDelete = () => {
    if (!expense) return;
    void confirm(t('expenses.detail.delete_alert_title'), t('common.cannot_be_undone'), t('expenses.detail.delete_alert_confirm')).then(async confirmed => {
      if (confirmed) {
        const removed = await storeApi.getState().removeExpense(expense.id, expense.tripId ?? '');
        if (removed) router.back();
      }
    });
  };

  if (loading) {
    return (
      <ScreenWrapper>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary.default} size="large" />
        </View>
      </ScreenWrapper>
    );
  }

  if (error || !expense) {
    return (
      <ScreenWrapper>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <Text variant="body" color={colors.error.default} style={{ textAlign: 'center' }}>
            {error?.kind === 'NotFoundError' ? t('expenses.detail.error_not_found') : t('expenses.detail.error_load')}
          </Text>
        </View>
      </ScreenWrapper>
    );
  }

  const payer       = members.find(m => m.userId === expense.paidByUserId);
  const payerName   = payer?.displayName ?? 'Unknown';
  const payerColor  = personColorFor(expense.paidByUserId, members);
  const originalAmount = expense.metadata.originalAmount;
  const lineItems   = expense.metadata.lineItems ?? [];

  return (
    <ScreenWrapper>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.background }}>
        <View style={detailStyles.titleRow}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Feather name="chevron-left" size={26} color={colors.text.primary} />
          </Pressable>
          <Text style={detailStyles.title} numberOfLines={1}>{expense.description}</Text>
          {tripClosed ? (
            <View style={{ width: 26 }} />
          ) : (
            <Pressable
              onPress={() => router.push(`/expense/edit?id=${expense.id}`)}
              accessibilityRole="button"
              accessibilityLabel={t('expenses.detail.edit_label')}
              hitSlop={10}
            >
              <Feather name="edit-2" size={18} color={colors.text.secondary} />
            </Pressable>
          )}
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 20 + TAB_BAR_HEIGHT }}>

        {/* Amount + conversion + date */}
        <Animated.View
          entering={Platform.OS !== 'web' ? SlideInDown.duration(400).springify() : undefined}
          style={{ alignItems: 'center', marginBottom: 20 }}
        >
          <Text style={[detailStyles.amount, { marginBottom: 4 }]}>
            {formatCurrency(expense.totalAmountCents, expense.currency)}
          </Text>
          {originalAmount && (
            <Text style={detailStyles.conversionCaption}>
              {formatCurrency(originalAmount.amountCents, originalAmount.currency)}
              {' entered · 1 '}{originalAmount.currency}{' = '}{formatRate(originalAmount.exchangeRate)}{' '}{expense.currency}
              {originalAmount.source === 'approximate' ? ' · approx.' : ''}
            </Text>
          )}
          <Text style={detailStyles.dateCaption}>
            {expense.createdAt.toLocaleDateString(undefined, {
              weekday: 'short', month: 'short', day: 'numeric',
            })}
          </Text>
        </Animated.View>

        {/* Receipt image — tap to view fullscreen */}
        <ExpenseReceiptSection receiptPath={expense.metadata.receiptUrl} />

        {/* Paid by */}
        <ExpensePaidByCard
          payerName={payerName}
          payerColor={payerColor.bg}
          avatarUrl={payer?.avatarUrl}
          label={t('expenses.detail.paid_by_label')}
          style={{ marginBottom: 16 }}
        />

        {/* Items — only shown for an itemized expense */}
        {lineItems.length > 0 && (
          <View style={[detailStyles.card, { marginBottom: 16 }]}>
            <Text style={[detailStyles.fieldLabel, { marginBottom: 8 }]}>
              {t('expenses.detail.items_title', { count: lineItems.length })}
            </Text>
            {lineItems.map((item, i) => (
              <View key={item.id}>
                <View style={{ paddingVertical: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text variant="body" style={{ flex: 1, marginRight: 8 }} numberOfLines={1}>
                      {item.description || t('expenses.line_item.placeholder')}
                    </Text>
                    <Text style={detailStyles.splitAmount}>
                      {formatCurrency(item.amountCents, expense.currency)}
                    </Text>
                  </View>
                  <View
                    style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}
                    accessibilityLabel={t('expenses.detail.assigned_to_label')}
                  >
                    {item.assignedUserIds.map(userId => {
                      const member = members.find(m => m.userId === userId);
                      const name   = member?.displayName ?? userId;
                      const palette = personColorFor(userId, members);
                      return (
                        <Avatar key={userId} initials={name} bg={palette.bg} url={member?.avatarUrl} size="xs" />
                      );
                    })}
                  </View>
                </View>
                {i < lineItems.length - 1 && <Divider />}
              </View>
            ))}
          </View>
        )}

        {/* Splits */}
        <View style={detailStyles.card}>
          <Text style={[detailStyles.fieldLabel, { marginBottom: 8 }]}>
            {t('expenses.detail.split_title', { count: expense.splits.length })}
          </Text>

          {expense.splits.map((split, i) => {
            const member  = members.find(m => m.userId === split.userId);
            const name    = member?.displayName ?? split.userId;
            const palette = personColorFor(split.userId, members);

            return (
              <View key={split.id}>
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10 }}>
                  <Avatar initials={name} bg={palette.bg} url={member?.avatarUrl} size="sm" />
                  <Text variant="body" style={{ flex: 1, marginLeft: 10 }} numberOfLines={1}>
                    {name}
                  </Text>
                  <Text style={detailStyles.splitAmount}>
                    {formatCurrency(split.amountOwedCents, expense.currency)}
                  </Text>
                </View>
                {i < expense.splits.length - 1 && <Divider />}
              </View>
            );
          })}
        </View>

        {/* Delete — hidden for closed trips */}
        {!tripClosed && (
          <Pressable
            onPress={handleDelete}
            accessibilityRole="button"
            accessibilityLabel={t('expenses.detail.delete_label')}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              marginTop: 24,
              paddingVertical: 10,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Feather name="trash-2" size={15} color={colors.error.default} />
            <Text variant="label" color={colors.error.default}>{t('expenses.detail.delete_button')}</Text>
          </Pressable>
        )}
      </ScrollView>
    </ScreenWrapper>
  );
}

const makeDetailStyles = (colors: ColorPalette) => StyleSheet.create({
  titleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12,
  },
  title: {
    flex: 1, textAlign: 'center', marginHorizontal: 12,
    fontFamily: ledgerFonts.display, fontSize: 17, color: colors.text.primary,
  },
  amount: {
    fontFamily: ledgerFonts.display, fontSize: 34, color: colors.text.primary,
    fontVariant: ['tabular-nums'],
  },
  conversionCaption: {
    fontSize: 12.5, color: colors.text.secondary, marginBottom: 4, textAlign: 'center',
  },
  dateCaption: {
    fontSize: 12.5, color: colors.text.tertiary,
  },
  fieldLabel: {
    fontSize: 12, fontWeight: '600', color: colors.text.secondary,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: ledgerRadius.card,
    padding: 16,
    ...ledgerShadow.card,
  },
  splitAmount: {
    fontFamily: ledgerFonts.displaySemibold, fontSize: 14, color: colors.text.primary,
    fontVariant: ['tabular-nums'],
  },
});
