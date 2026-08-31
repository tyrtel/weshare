import React, { useState } from 'react';
import { View, ScrollView, ActivityIndicator, Pressable, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons, Feather } from '@expo/vector-icons';
import { ScreenWrapper } from '../../../src/components/ui/ScreenWrapper';
import { TAB_BAR_HEIGHT } from '../../../src/components/ui/UniversalTabBar';
import { Text } from '../../../src/components/ui/Text';
import { Avatar } from '../../../src/components/ui/Avatar';
import { Divider } from '../../../src/components/ui/Divider';
import { ExpensePaidByCard } from '../../../src/components/ui/ExpensePaidByCard';
import { ExpenseReceiptSection } from '../../../src/components/ui/ExpenseReceiptSection';
import { MakeRecurringSheet } from '../../../src/features/groups/components/MakeRecurringSheet';
import { useService, useTripSessionStore } from '../../../src/core/di/ServiceContext';
import { AUTH, TRIP_STORE, EXPENSE_REPO } from '../../../src/core/di/tokens';
import { useColors, personColorFor } from '../../../src/theme/colors';
import { personColors } from '../../../src/theme/colors';
import { tokens } from '../../../src/theme/tokens';
import { formatCurrency } from '../../../src/core/utils/formatCurrency';
import { confirm } from '../../../src/core/utils/confirm';
import { isOk } from '../../../src/core/types/Result';

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export default function GroupExpenseDetailScreen() {
  const { t }                                       = useTranslation();
  const colors                                      = useColors();
  const auth                                        = useService(AUTH);
  const router                                      = useRouter();
  const storeApi                                    = useService(TRIP_STORE);
  const expenseRepo                                 = useService(EXPENSE_REPO);
  const { id, groupId }                             = useLocalSearchParams<{ id: string; groupId: string }>();
  const [recurringSheetOpen, setRecurringSheetOpen] = useState(false);

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

  const memberMap = new Map(group.members.map(m => [m.userId, m]));
  const payer     = memberMap.get(expense.paidByUserId);
  const payerName = payer?.displayName ?? 'Unknown';
  const lineItems = expense.metadata?.lineItems ?? [];

  const currentUserId = auth.currentUser()?.id ?? '';

  const handleRecurringSuccess = () => {
    setRecurringSheetOpen(false);
    Alert.alert(t('groups.recurring.success_title'), t('groups.recurring.success_message'));
  };

  const handleClose = () => {
    void confirm(t('expenses.detail.close_alert_title'), t('expenses.detail.close_alert_message'), t('expenses.detail.close_alert_confirm')).then(async confirmed => {
      if (!confirmed) return;
      const settledAt = new Date();
      const result = await expenseRepo.settleExpense(expense.id, settledAt);
      if (isOk(result)) {
        storeApi.getState().settleGroupExpenseInStore(expense.id, groupId, settledAt);
        router.back();
      }
    });
  };

  const handleReopen = async () => {
    const result = await expenseRepo.settleExpense(expense.id, null);
    if (isOk(result)) {
      storeApi.getState().settleGroupExpenseInStore(expense.id, groupId, null);
    }
  };

  const handleDelete = () => {
    void confirm(t('expenses.detail.delete_alert_title'), t('common.cannot_be_undone'), t('expenses.detail.delete_alert_confirm')).then(async confirmed => {
      if (!confirmed) return;
      await storeApi.getState().removeGroupExpense(expense.id, groupId);
      router.back();
    });
  };

  return (
    <ScreenWrapper>
      <Stack.Screen
        options={{
          title: expense.description,
          headerRight: expense.settledAt ? undefined : () => (
            <Pressable
              onPress={() => router.push(`/expense/edit?id=${expense.id}&groupId=${groupId}`)}
              accessibilityRole="button"
              accessibilityLabel={t('expenses.detail.edit_label')}
              hitSlop={10}
            >
              <Feather name="edit-2" size={18} color={colors.text.secondary} />
            </Pressable>
          ),
        }}
      />
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
          </View>
          <Text variant="heading2" color={colors.primary.default}>
            {formatCurrency(expense.totalAmountCents, expense.currency)}
          </Text>
          <Text variant="caption" color={colors.text.secondary} style={{ marginTop: tokens.spacing.xs }}>
            {expense.createdAt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
          </Text>
        </View>

        {/* Receipt image — tap to view fullscreen */}
        <ExpenseReceiptSection receiptPath={expense.metadata?.receiptUrl} />

        {/* Paid by */}
        <ExpensePaidByCard
          payerName={payerName}
          payerColor={personColorFor(expense.paidByUserId, group.members).bg}
          avatarUrl={payer?.avatarUrl}
          label={t('expenses.detail.paid_by_label')}
          style={{ marginBottom: tokens.spacing.md }}
        />

        {/* Items — only shown for an itemized expense */}
        {lineItems.length > 0 && (
          <View style={{ backgroundColor: colors.surface, borderRadius: tokens.radius.card, padding: tokens.spacing.md, marginBottom: tokens.spacing.md }}>
            <Text variant="label" color={colors.text.secondary} style={{ marginBottom: tokens.spacing.sm }}>
              {t('expenses.detail.items_title', { count: lineItems.length })}
            </Text>
            {lineItems.map((item, i) => (
              <View key={item.id}>
                <View style={{ paddingVertical: tokens.spacing.sm }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text variant="body" style={{ flex: 1, marginRight: tokens.spacing.sm }} numberOfLines={1}>
                      {item.description || t('expenses.line_item.placeholder')}
                    </Text>
                    <Text variant="label" color={colors.text.primary}>
                      {formatCurrency(item.amountCents, expense.currency)}
                    </Text>
                  </View>
                  <View
                    style={{ flexDirection: 'row', gap: 6, marginTop: tokens.spacing.xs }}
                    accessibilityLabel={t('expenses.detail.assigned_to_label')}
                  >
                    {item.assignedUserIds.map(userId => {
                      const member = memberMap.get(userId);
                      const name   = member?.displayName ?? userId;
                      const palette = personColorFor(userId, group.members);
                      return (
                        <Avatar key={userId} initials={getInitials(name)} bg={palette.bg} url={member?.avatarUrl} size="xs" />
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
                    <Avatar initials={getInitials(name)} bg={palette.bg} url={member?.avatarUrl} size="sm" />
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

        {/* Make recurring */}
        <Pressable
          onPress={() => setRecurringSheetOpen(true)}
          accessibilityRole="button"
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: tokens.spacing.xs,
            marginTop: tokens.spacing.md,
            paddingVertical: tokens.spacing.sm,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Ionicons name="repeat-outline" size={16} color={colors.primary.default} />
          <Text variant="label" color={colors.primary.default}>{t('groups.recurring.make_recurring_button')}</Text>
        </Pressable>

        {/* Close / reopen — organizational only, mirrors closing a trip.
            Never deletes the expense or touches the group's ledger. */}
        {expense.settledAt ? (
          <Pressable
            onPress={handleReopen}
            accessibilityRole="button"
            accessibilityLabel={t('expenses.detail.reopen_label')}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              marginTop: 8,
              paddingVertical: 10,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Feather name="rotate-ccw" size={15} color={colors.primary.default} />
            <Text variant="label" color={colors.primary.default}>{t('expenses.detail.reopen_button')}</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={handleClose}
            accessibilityRole="button"
            accessibilityLabel={t('expenses.detail.close_label')}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              marginTop: 8,
              paddingVertical: 10,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Feather name="archive" size={15} color={colors.text.secondary} />
            <Text variant="label" color={colors.text.secondary}>{t('expenses.detail.close_button')}</Text>
          </Pressable>
        )}

        {/* Delete — permanently removes the expense from the group ledger, unlike close/reopen above. */}
        <Pressable
          onPress={handleDelete}
          accessibilityRole="button"
          accessibilityLabel={t('expenses.detail.delete_label')}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            marginTop: 8,
            paddingVertical: 10,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Feather name="trash-2" size={15} color={colors.error.default} />
          <Text variant="label" color={colors.error.default}>{t('expenses.detail.delete_button')}</Text>
        </Pressable>
      </ScrollView>

      {recurringSheetOpen && (
        <MakeRecurringSheet
          visible={recurringSheetOpen}
          expense={expense}
          groupId={groupId}
          createdByUserId={currentUserId}
          onClose={() => setRecurringSheetOpen(false)}
          onSuccess={handleRecurringSuccess}
        />
      )}
    </ScreenWrapper>
  );
}
