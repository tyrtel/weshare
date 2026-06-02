import React, { useState } from 'react';
import { View, ScrollView, Pressable, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ScreenWrapper } from '../../../components/ui/ScreenWrapper';
import { TAB_BAR_HEIGHT } from '../../../components/ui/UniversalTabBar';
import { Text } from '../../../components/ui/Text';
import { Button } from '../../../components/ui/Button';
import { Divider } from '../../../components/ui/Divider';
import { ClosedTripGuard } from '../../../components/ui/ClosedTripGuard';
import { ErrorBanner } from '../../../components/ui/ErrorBanner';
import { AmountInput } from '../components/AmountInput';
import { CategorySelector } from '../components/CategorySelector';
import { PayerSelector } from '../components/PayerSelector';
import { SplitMemberRow } from '../components/SplitMemberRow';
import { ReceiptCapture } from '../components/ReceiptCapture';
import type { SplitMode } from '../components/SplitMemberRow';
import { useAddExpense } from '../hooks/useAddExpense';
import { useSplitForm } from '../hooks/useSplitForm';
import { useTripDetail } from '../../trips/hooks/useTripDetail';
import { useColors } from '../../../theme/colors';
import { tokens } from '../../../theme/tokens';
import type { ParsedReceiptLineItem } from '../../../core/models/ParsedReceipt';

// ── Screen ────────────────────────────────────────────────────────────────────

const SPLIT_MODES: { key: SplitMode; label: string }[] = [
  { key: 'equal',        label: 'Equal' },
  { key: 'proportional', label: 'Proportional' },
  { key: 'custom',       label: 'Custom' },
];

export function AddExpenseScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const router     = useRouter();
  const colors     = useColors();

  const { trip, loading: tripLoading } = useTripDetail(tripId);
  const { addExpense, loading: saving, error } = useAddExpense(tripId);

  const [description,      setDescription]      = useState('');
  const [totalAmountCents, setTotalAmountCents]  = useState(0);
  const [category,         setCategory]         = useState<string | undefined>(undefined);
  const [lineItems,        setLineItems]         = useState<ParsedReceiptLineItem[]>([]);
  const [paidByUserId,     setPaidByUserId]      = useState('');
  const [initialised,      setInitialised]       = useState(false);
  const [dirty,            setDirty]             = useState(false);
  const [receiptPath,      setReceiptPath]        = useState<string | undefined>(undefined);

  if (trip && !initialised) {
    if (trip.members.length > 0) setPaidByUserId(trip.members[0].userId);
    setInitialised(true);
  }

  const split = useSplitForm({
    members: trip?.members ?? [],
    totalAmountCents,
  });

  const currency = trip?.currency ?? 'EUR';

  const isValid =
    description.trim().length > 0 &&
    totalAmountCents > 0 &&
    paidByUserId.length > 0 &&
    split.splitIsValid;

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleParsed = (
    parsedDescription: string,
    amountCents: number,
    parsedLineItems: ParsedReceiptLineItem[],
    path: string | undefined,
  ) => {
    if (parsedDescription) setDescription(parsedDescription);
    if (amountCents > 0) setTotalAmountCents(amountCents);
    if (parsedLineItems.length > 0) setLineItems(parsedLineItems);
    if (path) setReceiptPath(path);
  };

  const handleSubmit = async () => {
    const expense = await addExpense({
      description,
      totalAmountCents,
      currency,
      paidByUserId,
      splits: split.computedSplits,
      category,
      receiptUrl: receiptPath,
    });
    if (expense) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(tabs)');
      }
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

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

  if (tripLoading || !trip) return <ScreenWrapper />;

  return (
    <ScreenWrapper>
      <Stack.Screen options={{ title: 'Add Expense' }} />
      <ClosedTripGuard trip={trip} message="This trip is closed. No new expenses can be added.">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
      <ScrollView
        contentContainerStyle={{ padding: tokens.spacing.md, paddingBottom: tokens.spacing.xxl + TAB_BAR_HEIGHT }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Heading + receipt capture */}
        <Text variant="heading2" style={{ marginBottom: tokens.spacing.sm }}>Add Expense</Text>
        <ReceiptCapture onParsed={handleParsed} disabled={saving} style={{ marginBottom: tokens.spacing.md }} />

        {/* Description */}
        <Text variant="label" color={colors.text.secondary} style={{ marginBottom: tokens.spacing.xs }}>
          Description
        </Text>
        <TextInput
          value={description}
          onChangeText={v => { setDirty(true); setDescription(v); }}
          placeholder="e.g. Dinner at Chez Paul"
          placeholderTextColor={colors.text.tertiary}
          style={[inputBorder, { marginBottom: tokens.spacing.md }]}
          autoFocus
          returnKeyType="next"
          accessibilityLabel="Expense description"
        />

        {/* Line items preview (read-only, populated after OCR) */}
        {lineItems.length > 0 && (
          <View style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: tokens.radius.md,
            padding: tokens.spacing.sm,
            marginBottom: tokens.spacing.md,
          }}>
            <Text variant="caption" color={colors.text.secondary} style={{ marginBottom: tokens.spacing.xs }}>
              Receipt items
            </Text>
            {lineItems.map((item, i) => (
              <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 }}>
                <Text variant="caption" color={colors.text.primary} style={{ flex: 1 }}>{item.description}</Text>
                <Text variant="caption" color={colors.text.secondary}>
                  {(item.amountCents / 100).toFixed(2)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Category */}
        <CategorySelector value={category} onChange={setCategory} />

        {/* Total amount */}
        <View style={{ marginBottom: tokens.spacing.md }}>
          <AmountInput
            amountCents={totalAmountCents}
            onChangeCents={v => { setDirty(true); setTotalAmountCents(v); }}
            currency={currency}
            label="Total"
          />
          {dirty && totalAmountCents === 0 && (
            <Text variant="caption" color={colors.text.secondary} style={{ marginTop: tokens.spacing.xs }}>
              Enter an amount to continue
            </Text>
          )}
        </View>

        <Divider style={{ marginBottom: tokens.spacing.md }} />

        {/* Paid by */}
        <Text variant="label" color={colors.text.secondary} style={{ marginBottom: tokens.spacing.sm }}>
          Paid by
        </Text>
        <PayerSelector
          members={trip.members}
          selectedUserId={paidByUserId}
          onSelect={setPaidByUserId}
        />

        <Divider style={{ marginVertical: tokens.spacing.md }} />

        {/* Split mode header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: tokens.spacing.sm }}>
          <Text variant="label" color={colors.text.secondary}>
            Split between
          </Text>

          {/* 3-way mode toggle */}
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
                  <Text
                    variant="caption"
                    color={active ? colors.primary.default : colors.text.secondary}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Split rows */}
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

        {/* Remainder warning — not shown in proportional mode since it's always balanced */}
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

        {/* Validation / network error */}
        <ErrorBanner error={error} fallback="Could not save expense." style={{ marginTop: tokens.spacing.sm }} />

        <View style={{ marginTop: tokens.spacing.lg }}>
          <Button
            label={saving ? 'Saving…' : 'Add expense'}
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
