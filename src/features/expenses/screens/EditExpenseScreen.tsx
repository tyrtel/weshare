import React, { useState } from 'react';
import { View, ScrollView, Pressable, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ScreenWrapper } from '../../../components/ui/ScreenWrapper';
import { TAB_BAR_HEIGHT } from '../../../components/ui/UniversalTabBar';
import { Text } from '../../../components/ui/Text';
import { Button } from '../../../components/ui/Button';
import { Divider } from '../../../components/ui/Divider';
import { AmountInput } from '../components/AmountInput';
import { CategorySelector } from '../components/CategorySelector';
import { PayerSelector } from '../components/PayerSelector';
import { SplitMemberRow } from '../components/SplitMemberRow';
import type { SplitMode } from '../components/SplitMemberRow';
import { useEditExpense } from '../hooks/useEditExpense';
import { useExpenseDetail } from '../hooks/useExpenseDetail';
import { useTripDetail } from '../../trips/hooks/useTripDetail';
import { useSplitForm, type SplitFormEntry } from '../hooks/useSplitForm';
import { ClosedTripGuard } from '../../../components/ui/ClosedTripGuard';
import { ErrorBanner } from '../../../components/ui/ErrorBanner';
import { useColors } from '../../../theme/colors';
import { tokens } from '../../../theme/tokens';

const SPLIT_MODES: { key: SplitMode; label: string }[] = [
  { key: 'equal',        label: 'Equal' },
  { key: 'proportional', label: 'Proportional' },
  { key: 'custom',       label: 'Custom' },
];

// ── Screen ────────────────────────────────────────────────────────────────────

export function EditExpenseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colors = useColors();

  const { expense, loading: expLoading } = useExpenseDetail(id);
  const { trip,    loading: tripLoading } = useTripDetail(expense?.tripId ?? '');
  const { editExpense, loading: saving, error } = useEditExpense();

  const [description,      setDescription]      = useState('');
  const [totalAmountCents, setTotalAmountCents]  = useState(0);
  const [category,         setCategory]         = useState<string | undefined>(undefined);
  const [paidByUserId,     setPaidByUserId]      = useState('');
  const [initialised,      setInitialised]       = useState(false);

  // Pre-fill non-split fields once both expense and trip are loaded.
  if (expense && trip && !initialised) {
    setDescription(expense.description);
    setTotalAmountCents(expense.totalAmountCents);
    setCategory(expense.metadata.category);
    setPaidByUserId(expense.paidByUserId);
    setInitialised(true);
  }

  // Build initial entries from existing splits so the hook can pre-fill in edit mode.
  const initialEntries: SplitFormEntry[] | undefined = (expense && trip)
    ? trip.members.map(m => {
        const existingSplit = expense.splits.find(s => s.userId === m.userId);
        return {
          userId: m.userId,
          included: !!existingSplit,
          customAmountCents: existingSplit ? existingSplit.amountOwedCents : null,
        };
      })
    : undefined;

  const split = useSplitForm({
    members: trip?.members ?? [],
    totalAmountCents,
    initialEntries,
    initialMode: 'custom',
    ready: !!expense && !!trip,
  });

  const currency = trip?.currency ?? expense?.currency ?? 'EUR';

  const isValid =
    description.trim().length > 0 &&
    totalAmountCents > 0 &&
    paidByUserId.length > 0 &&
    split.splitIsValid;

  const handleSubmit = async () => {
    if (!expense) return;
    const updated = await editExpense(expense, {
      description,
      totalAmountCents,
      currency,
      paidByUserId,
      splits: split.computedSplits,
      category,
    });
    if (updated) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)');
    }
  };

  const inputBorder = {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
    color: colors.text.primary,
    fontSize: tokens.fontSize.md,
  } as const;

  if (expLoading || tripLoading || !expense || !trip) return <ScreenWrapper />;

  return (
    <ScreenWrapper>
      <Stack.Screen options={{ title: 'Edit Expense' }} />
      <ClosedTripGuard trip={trip} message="This trip is closed. Expenses can no longer be edited.">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={{ padding: tokens.spacing.md, paddingBottom: tokens.spacing.xxl + TAB_BAR_HEIGHT }}
          keyboardShouldPersistTaps="handled"
        >
          <Text variant="heading2" style={{ marginBottom: tokens.spacing.lg }}>
            Edit Expense
          </Text>

          <Text variant="label" color={colors.text.secondary} style={{ marginBottom: tokens.spacing.xs }}>
            Description
          </Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="e.g. Dinner at Chez Paul"
            placeholderTextColor={colors.text.tertiary}
            style={[inputBorder, { marginBottom: tokens.spacing.md }]}
            returnKeyType="next"
            accessibilityLabel="Expense description"
          />

          <CategorySelector value={category} onChange={setCategory} />

          <View style={{ marginBottom: tokens.spacing.md }}>
            <AmountInput
              amountCents={totalAmountCents}
              onChangeCents={setTotalAmountCents}
              currency={currency}
              label="Total"
            />
          </View>

          <Divider style={{ marginBottom: tokens.spacing.md }} />

          <Text variant="label" color={colors.text.secondary} style={{ marginBottom: tokens.spacing.sm }}>
            Paid by
          </Text>
          <PayerSelector
            members={trip.members}
            selectedUserId={paidByUserId}
            onSelect={setPaidByUserId}
          />

          <Divider style={{ marginVertical: tokens.spacing.md }} />

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: tokens.spacing.sm }}>
            <Text variant="label" color={colors.text.secondary}>Split between</Text>
            <View style={{ flexDirection: 'row', gap: tokens.spacing.xs }}>
              {SPLIT_MODES.map(({ key, label }) => {
                const active = split.splitMode === key;
                return (
                  <Pressable
                    key={key}
                    onPress={() => split.handleSetMode(key)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: active }}
                    style={{
                      paddingHorizontal: tokens.spacing.sm,
                      paddingVertical: tokens.spacing.xs,
                      borderRadius: tokens.radius.pill,
                      borderWidth: 1,
                      borderColor: active ? colors.primary.default : colors.border,
                      backgroundColor: active ? colors.primary.subtle : 'transparent',
                    }}
                  >
                    <Text variant="caption" color={active ? colors.primary.default : colors.text.secondary}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {trip.members.map((member, i) => {
            const entry = split.splitEntries.find(e => e.userId === member.userId);
            if (!entry) return null;
            return (
              <SplitMemberRow
                key={member.userId}
                member={member}
                colorIndex={i}
                included={entry.included}
                amountCents={split.getDisplayAmountFor(member.userId)}
                splitMode={split.splitMode}
                weight={split.weights[member.userId] ?? 0}
                currency={currency}
                onToggleInclude={() => split.handleToggleMember(member.userId)}
                onChangeAmount={cents => split.handleChangeAmount(member.userId, cents)}
                onChangeWeight={bps => split.handleChangeWeight(member.userId, bps)}
              />
            );
          })}

          {split.splitMode === 'custom' && split.remainder !== 0 && (
            <View
              style={{
                padding: tokens.spacing.sm,
                backgroundColor: split.remainder > 0 ? colors.warning.bg : colors.error.bg,
                borderRadius: tokens.radius.md,
                marginTop: tokens.spacing.sm,
              }}
            >
              <Text variant="caption" color={split.remainder > 0 ? colors.warning.default : colors.error.default}>
                {split.remainder > 0
                  ? `${(split.remainder / 100).toFixed(2)} ${currency} still to assign`
                  : `Over by ${(Math.abs(split.remainder) / 100).toFixed(2)} ${currency}`}
              </Text>
            </View>
          )}

          <ErrorBanner error={error} fallback="Could not update expense." style={{ marginTop: tokens.spacing.sm }} />

          <View style={{ marginTop: tokens.spacing.lg }}>
            <Button
              label={saving ? 'Saving…' : 'Save changes'}
              onPress={handleSubmit}
              disabled={!isValid || saving}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      </ClosedTripGuard>
    </ScreenWrapper>
  );
}
