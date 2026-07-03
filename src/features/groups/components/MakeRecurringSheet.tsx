import React, { useState, useCallback } from 'react';
import { Modal, View, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import Animated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Text } from '../../../components/ui/Text';
import { Divider } from '../../../components/ui/Divider';
import { useColors } from '../../../theme/colors';
import { tokens } from '../../../theme/tokens';
import { useCreateRecurringExpense } from '../hooks/useCreateRecurringExpense';
import type { Expense } from '../../../core/models/Expense';
import type { RecurrencePeriod } from '../../../core/models/RecurringExpense';

interface MakeRecurringSheetProps {
  visible:          boolean;
  expense:          Expense;
  groupId:          string;
  createdByUserId:  string;
  onClose:          () => void;
  onSuccess:        () => void;
}

const PERIODS: { key: RecurrencePeriod; labelKey: string }[] = [
  { key: 'weekly',    labelKey: 'groups.recurring.period_weekly' },
  { key: 'biweekly',  labelKey: 'groups.recurring.period_biweekly' },
  { key: 'monthly',   labelKey: 'groups.recurring.period_monthly' },
  { key: 'quarterly', labelKey: 'groups.recurring.period_quarterly' },
];

function todayMidnightLocal(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function MakeRecurringSheet({
  visible,
  expense,
  groupId,
  createdByUserId,
  onClose,
  onSuccess,
}: MakeRecurringSheetProps) {
  const { t }    = useTranslation();
  const colors   = useColors();
  const today    = todayMidnightLocal();

  const [period,    setPeriod]    = useState<RecurrencePeriod>('monthly');
  const [startDate, setStartDate] = useState<Date>(today);

  const { createRecurringExpense, loading, error } = useCreateRecurringExpense(groupId);

  const handleConfirm = useCallback(async () => {
    const result = await createRecurringExpense({
      description:      expense.description,
      totalAmountCents: expense.totalAmountCents,
      currency:         expense.currency,
      paidByUserId:     expense.paidByUserId,
      period,
      startDate,
      createdByUserId,
      splits:           expense.splits.map(s => ({
        userId:          s.userId,
        amountOwedCents: s.amountOwedCents,
      })),
      skipFirstExpense: true,
    });
    if (result) onSuccess();
  }, [createRecurringExpense, expense, period, startDate, createdByUserId, onSuccess]);

  const decrementDay = useCallback(() => {
    setStartDate(prev => {
      const candidate = addDays(prev, -1);
      return candidate < today ? prev : candidate;
    });
  }, [today]);

  const incrementDay = useCallback(() => {
    setStartDate(prev => addDays(prev, 1));
  }, []);

  const atToday  = startDate.getTime() === today.getTime();
  const dateLabel = startDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.overlay} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.cancel')} />

      <Animated.View
        entering={SlideInDown.springify().damping(22).stiffness(200)}
        exiting={SlideOutDown.duration(220)}
        style={[styles.sheet, { backgroundColor: colors.background }]}
      >
        {/* Handle */}
        <View style={styles.handle} />

        {/* Header */}
        <View style={styles.headerRow}>
          <Text variant="heading2">{t('groups.recurring.sheet_title')}</Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.cancel')} hitSlop={8}>
            <Ionicons name="close" size={22} color={colors.text.secondary} />
          </Pressable>
        </View>

        <Text variant="caption" color={colors.text.secondary} style={{ marginBottom: tokens.spacing.lg }}>
          {t('groups.recurring.sheet_subtitle')}
        </Text>

        {/* Period selector */}
        <Text variant="label" color={colors.text.secondary} style={{ marginBottom: tokens.spacing.sm }}>
          {t('groups.recurring.period_label')}
        </Text>
        <View style={[styles.optionGroup, { backgroundColor: colors.surface, borderRadius: tokens.radius.card }]}>
          {PERIODS.map(({ key, labelKey }, i) => (
            <View key={key}>
              <Pressable
                onPress={() => setPeriod(key)}
                accessibilityRole="radio"
                accessibilityState={{ checked: period === key }}
                style={({ pressed }) => [styles.optionRow, { opacity: pressed ? 0.7 : 1 }]}
              >
                <Text variant="body">{t(labelKey)}</Text>
                {period === key && <Ionicons name="checkmark" size={18} color={colors.primary.default} />}
              </Pressable>
              {i < PERIODS.length - 1 && <Divider />}
            </View>
          ))}
        </View>

        {/* Start date */}
        <Text variant="label" color={colors.text.secondary} style={{ marginTop: tokens.spacing.lg, marginBottom: tokens.spacing.sm }}>
          {t('groups.recurring.start_date_label')}
        </Text>
        <View style={[styles.dateRow, { backgroundColor: colors.surface, borderRadius: tokens.radius.card }]}>
          <Pressable
            onPress={decrementDay}
            disabled={atToday}
            accessibilityRole="button"
            accessibilityLabel={t('groups.recurring.prev_day_label')}
            style={{ padding: tokens.spacing.sm, opacity: atToday ? 0.3 : 1 }}
          >
            <Ionicons name="chevron-back" size={20} color={colors.text.primary} />
          </Pressable>
          <Text variant="body" style={{ flex: 1, textAlign: 'center' }}>{dateLabel}</Text>
          <Pressable
            onPress={incrementDay}
            accessibilityRole="button"
            accessibilityLabel={t('groups.recurring.next_day_label')}
            style={{ padding: tokens.spacing.sm }}
          >
            <Ionicons name="chevron-forward" size={20} color={colors.text.primary} />
          </Pressable>
        </View>

        {/* Error */}
        {!!error && (
          <Text variant="caption" color={colors.error.default} style={{ marginTop: tokens.spacing.sm, textAlign: 'center' }}>
            {t('groups.recurring.error_fallback')}
          </Text>
        )}

        {/* Confirm */}
        <Pressable
          onPress={handleConfirm}
          disabled={loading}
          accessibilityRole="button"
          style={({ pressed }) => ({
            backgroundColor: colors.primary.default,
            borderRadius: tokens.radius.md,
            paddingVertical: tokens.spacing.md,
            alignItems: 'center',
            marginTop: tokens.spacing.lg,
            opacity: pressed || loading ? 0.7 : 1,
          })}
        >
          {loading
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text variant="label" color="#ffffff">{t('groups.recurring.confirm_button')}</Text>
          }
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: tokens.spacing.lg,
    paddingBottom: tokens.spacing.xl + 16,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(128,128,128,0.35)',
    alignSelf: 'center',
    marginBottom: tokens.spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: tokens.spacing.xs,
  },
  optionGroup: {
    overflow: 'hidden',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.md,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: tokens.spacing.xs,
    paddingHorizontal: tokens.spacing.xs,
  },
});
