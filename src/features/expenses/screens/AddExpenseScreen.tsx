import React, { useState, useMemo } from 'react';
import {
  View, ScrollView, Pressable, TextInput, KeyboardAvoidingView,
  Platform, ActivityIndicator, StyleSheet,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ScreenWrapper } from '../../../components/ui/ScreenWrapper';
import { TAB_BAR_HEIGHT } from '../../../components/ui/UniversalTabBar';
import { Text } from '../../../components/ui/Text';
import { Divider } from '../../../components/ui/Divider';
import { ClosedTripGuard } from '../../../components/ui/ClosedTripGuard';
import { ErrorBanner } from '../../../components/ui/ErrorBanner';
import { AmountInput } from '../components/AmountInput';
import { CategorySelector } from '../components/CategorySelector';
import { PayerSelector } from '../components/PayerSelector';
import { SplitMemberRow } from '../components/SplitMemberRow';
import { LineItemRow } from '../components/LineItemRow';
import { ReceiptCapture } from '../components/ReceiptCapture';
import type { SplitMode } from '../components/SplitMemberRow';
import { useAddExpense } from '../hooks/useAddExpense';
import { useSplitForm } from '../hooks/useSplitForm';
import { useCurrencyRate } from '../hooks/useCurrencyRate';
import { useTripDetail } from '../../trips/hooks/useTripDetail';
import { useTripSessionStore } from '../../../core/di/ServiceContext';
import { useColors } from '../../../theme/colors';
import { tokens } from '../../../theme/tokens';
import { CURRENCIES, currencyLabel, currencySymbol } from '../../../core/constants/currencies';
import { formatCurrency } from '../../../core/utils/formatCurrency';
import type { ParsedReceiptLineItem } from '../../../core/models/ParsedReceipt';
import type { SplitResult } from '../utils/splitCalculations';

// ── Constants ─────────────────────────────────────────────────────────────────

const SPLIT_MODES: { key: SplitMode; label: string }[] = [
  { key: 'equal',        label: 'Equal' },
  { key: 'proportional', label: 'Proportional' },
  { key: 'custom',       label: 'Custom' },
  { key: 'itemized',     label: 'Itemized' },
];

const EMPTY_EXPENSES: never[] = [];

// ── Helpers ───────────────────────────────────────────────────────────────────

// Strips trailing zeros beyond the first decimal digit: 1.0800→1.08, 2.0000→2.0
function formatRate(r: number): string {
  const trimmed = r.toFixed(4).replace(/\.?0+$/, '');
  return trimmed.includes('.') ? trimmed : `${trimmed}.0`;
}

function scaleAndCorrect(splits: SplitResult[], rate: number, targetCents: number): SplitResult[] {
  const scaled = splits.map(s => ({ ...s, amountOwedCents: Math.round(s.amountOwedCents * rate) }));
  const diff   = targetCents - scaled.reduce((s, e) => s + e.amountOwedCents, 0);
  if (diff !== 0 && scaled.length > 0) {
    scaled[scaled.length - 1] = {
      ...scaled[scaled.length - 1],
      amountOwedCents: scaled[scaled.length - 1].amountOwedCents + diff,
    };
  }
  return scaled;
}

// ── Screen ────────────────────────────────────────────────────────────────────

export function AddExpenseScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const router     = useRouter();
  const colors     = useColors();

  const { trip, loading: tripLoading } = useTripDetail(tripId);
  const { addExpense, loading: saving, error } = useAddExpense(tripId);

  // Read existing expenses to derive the last-used foreign currency default.
  const tripExpenses = useTripSessionStore(s => (s.expenses as Record<string, typeof EMPTY_EXPENSES>)[tripId] ?? EMPTY_EXPENSES);

  const [description,          setDescription]          = useState('');
  const [totalAmountCents,     setTotalAmountCents]      = useState(0);
  const [category,             setCategory]             = useState<string | undefined>(undefined);
  const [paidByUserId,         setPaidByUserId]          = useState('');
  const [entryCurrency,        setEntryCurrency]        = useState('');
  const [currencyDropVisible,  setCurrencyDropVisible]  = useState(false);
  const [initialised,          setInitialised]          = useState(false);
  const [dirty,                setDirty]                = useState(false);
  const [receiptPath,          setReceiptPath]          = useState<string | undefined>(undefined);

  // Render-phase init: fires once when trip data arrives.
  if (trip && !initialised) {
    if (trip.members.length > 0) setPaidByUserId(trip.members[0].userId);

    // Default to last foreign currency used in this trip, else trip currency.
    const lastForeign = [...tripExpenses]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .find(e => e.metadata?.originalAmount)
      ?.metadata?.originalAmount?.currency ?? null;
    setEntryCurrency(lastForeign ?? trip.currency);

    setInitialised(true);
  }

  const tripCurrency   = trip?.currency ?? 'EUR';
  const isForeign      = entryCurrency !== '' && entryCurrency !== tripCurrency;
  const rate           = useCurrencyRate(entryCurrency || tripCurrency, tripCurrency);

  // Converted total in trip currency (used for split computation and submission).
  const convertedCents = useMemo(() => {
    if (!isForeign || !rate.result) return totalAmountCents;
    return Math.round(totalAmountCents * rate.result.rate);
  }, [isForeign, totalAmountCents, rate.result]);

  const split = useSplitForm({
    members: trip?.members ?? [],
    totalAmountCents: convertedCents,
  });

  // For itemized mode items are in entry currency; convert the total.
  const isItemized   = split.splitMode === 'itemized';
  const enteredTotal = isItemized ? split.itemizedTotal : totalAmountCents;
  const effectiveTotal = !isForeign || !rate.result
    ? enteredTotal
    : Math.round(enteredTotal * rate.result.rate);

  const hasValidRate = !isForeign || rate.result !== null;
  const isValid =
    description.trim().length > 0 &&
    effectiveTotal > 0 &&
    paidByUserId.length > 0 &&
    split.splitIsValid &&
    hasValidRate &&
    !rate.loading;

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleParsed = (
    parsedDescription: string,
    amountCents: number,
    parsedLineItems: ParsedReceiptLineItem[],
    path: string | undefined,
  ) => {
    if (parsedDescription) setDescription(parsedDescription);
    if (path) setReceiptPath(path);
    if (parsedLineItems.length > 0 && trip) {
      split.initFromParsed(parsedLineItems, trip.members);
    } else if (amountCents > 0) {
      setTotalAmountCents(amountCents);
    }
  };

  const handleSubmit = async () => {
    const rawSplits  = split.computedSplits;
    const finalSplits = isForeign && rate.result
      ? scaleAndCorrect(rawSplits, rate.result.rate, effectiveTotal)
      : rawSplits;

    const originalAmount = isForeign && rate.result
      ? {
          amountCents:  enteredTotal,
          currency:     entryCurrency,
          exchangeRate: rate.result.rate,
          source:       rate.result.source,
        }
      : undefined;

    const expense = await addExpense({
      description,
      totalAmountCents: effectiveTotal,
      currency: tripCurrency,
      paidByUserId,
      splits: finalSplits,
      category,
      receiptUrl:     receiptPath,
      lineItems:      isItemized ? split.lineItems : undefined,
      originalAmount,
    });
    if (expense) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)');
    }
  };

  // ── Styles ───────────────────────────────────────────────────────────────────

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

  // ── Render ───────────────────────────────────────────────────────────────────

  if (tripLoading || !trip) return <ScreenWrapper />;

  const rateSourceColor = rate.result?.source === 'live'
    ? colors.text.secondary
    : colors.warning?.default ?? colors.text.secondary;


  return (
    <ScreenWrapper>
      <Stack.Screen options={{ title: 'Add Expense' }} />
      <ClosedTripGuard trip={trip} message="This trip is closed. No new expenses can be added.">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
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

            {/* Category */}
            <CategorySelector value={category} onChange={setCategory} />

            {/* Amount + currency — hidden in itemized mode */}
            {!isItemized && (
              <View style={{ marginBottom: tokens.spacing.sm }}>
                <AmountInput
                  amountCents={totalAmountCents}
                  onChangeCents={v => { setDirty(true); setTotalAmountCents(v); }}
                  currency={entryCurrency || tripCurrency}
                  label="Amount"
                />
                {dirty && totalAmountCents === 0 && (
                  <Text variant="caption" color={colors.text.secondary} style={{ marginTop: tokens.spacing.xs }}>
                    Enter an amount to continue
                  </Text>
                )}
              </View>
            )}

            {/* Currency selector pill */}
            {!isItemized && (
              <Pressable
                onPress={() => setCurrencyDropVisible(true)}
                accessibilityRole="combobox"
                accessibilityLabel="Select entry currency"
                accessibilityState={{ expanded: currencyDropVisible }}
                style={({ pressed }) => ({
                  alignSelf: 'flex-start',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: tokens.spacing.xs,
                  paddingHorizontal: tokens.spacing.sm,
                  paddingVertical: tokens.spacing.xs,
                  borderRadius: tokens.radius.pill,
                  borderWidth: 1,
                  borderColor: isForeign ? colors.primary.default : colors.border,
                  backgroundColor: isForeign ? colors.primary.subtle : 'transparent',
                  marginBottom: tokens.spacing.sm,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text
                  variant="caption"
                  color={isForeign ? colors.primary.default : colors.text.secondary}
                >
                  {entryCurrency || tripCurrency}
                </Text>
                <Ionicons
                  name="chevron-down"
                  size={12}
                  color={isForeign ? colors.primary.default : colors.text.secondary}
                />
              </Pressable>
            )}

            {/* Exchange rate indicator */}
            {!isItemized && isForeign && (
              <View style={{ marginBottom: tokens.spacing.md }}>
                {rate.loading ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.xs }}>
                    <ActivityIndicator size="small" color={colors.text.secondary} />
                    <Text variant="caption" color={colors.text.secondary}>Fetching rate…</Text>
                  </View>
                ) : rate.error ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.xs }}>
                    <Ionicons name="warning-outline" size={14} color={rateSourceColor} />
                    <Text variant="caption" color={rateSourceColor}>Rate unavailable</Text>
                    <Pressable onPress={rate.refresh} hitSlop={8}>
                      <Text variant="caption" color={colors.primary.default}> Retry</Text>
                    </Pressable>
                  </View>
                ) : rate.result ? (
                  <Text variant="caption" color={rateSourceColor}>
                    {`at ${rate.result.source !== 'live' ? '≈' : ''}${currencySymbol(entryCurrency)}${formatRate(rate.result.rate)}${convertedCents > 0 ? ` = ${formatCurrency(convertedCents, tripCurrency)}` : ''}${rate.result.source === 'approximate' ? ' · approx.' : ''}`}
                  </Text>
                ) : null}
              </View>
            )}

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

            {/* Split mode toggle */}
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

            {/* ── Itemized mode ── */}
            {isItemized ? (
              <>
                {split.lineItems.map(item => (
                  <LineItemRow
                    key={item.id}
                    item={item}
                    members={trip.members}
                    currency={entryCurrency || tripCurrency}
                    onUpdateDescription={desc => split.updateLineItem(item.id, { description: desc })}
                    onUpdateAmount={cents => split.updateLineItem(item.id, { amountCents: cents })}
                    onToggleMember={userId => split.toggleMemberInItem(item.id, userId)}
                    onRemove={() => split.removeLineItem(item.id)}
                  />
                ))}
                <Pressable
                  onPress={split.addLineItem}
                  accessibilityRole="button"
                  accessibilityLabel="Add item"
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: tokens.spacing.xs,
                    paddingVertical: tokens.spacing.sm,
                    opacity: pressed ? 0.6 : 1,
                  })}
                >
                  <Ionicons name="add-circle-outline" size={18} color={colors.primary.default} />
                  <Text variant="label" color={colors.primary.default}>Add item</Text>
                </Pressable>
                {split.lineItems.length > 0 && (
                  <View style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    paddingVertical: tokens.spacing.sm,
                    borderTopWidth: 1,
                    borderTopColor: colors.border,
                    marginTop: tokens.spacing.xs,
                  }}>
                    <Text variant="label" color={colors.text.secondary}>Total</Text>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text variant="label" color={colors.text.primary}>
                        {formatCurrency(split.itemizedTotal, entryCurrency || tripCurrency)}
                      </Text>
                      {isForeign && rate.result && split.itemizedTotal > 0 && (
                        <Text variant="caption" color={colors.text.secondary}>
                          = {formatCurrency(effectiveTotal, tripCurrency)}
                        </Text>
                      )}
                    </View>
                  </View>
                )}
              </>
            ) : (
              /* ── Equal / proportional / custom modes ── */
              <>
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
                      currency={tripCurrency}
                      onToggleInclude={() => split.handleToggleMember(member.userId)}
                      onChangeAmount={cents => split.handleChangeAmount(member.userId, cents)}
                      onChangeWeight={bps => split.handleChangeWeight(member.userId, bps)}
                    />
                  );
                })}
                {split.splitMode === 'custom' && split.remainder !== 0 && (
                  <View style={{
                    padding: tokens.spacing.sm,
                    backgroundColor: split.remainder > 0 ? colors.warning?.bg : colors.error.bg,
                    borderRadius: tokens.radius.md,
                    marginTop: tokens.spacing.sm,
                  }}>
                    <Text variant="caption" color={split.remainder > 0 ? colors.warning?.default : colors.error.default}>
                      {split.remainder > 0
                        ? `${formatCurrency(split.remainder, tripCurrency)} still to assign`
                        : `Over by ${formatCurrency(Math.abs(split.remainder), tripCurrency)}`}
                    </Text>
                  </View>
                )}
              </>
            )}

            <ErrorBanner error={error} fallback="Could not save expense." style={{ marginTop: tokens.spacing.sm }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </ClosedTripGuard>

      {/* Floating confirm FAB */}
      {trip?.status !== 'closed' && (
        <Pressable
          onPress={handleSubmit}
          disabled={!isValid || saving}
          accessibilityRole="button"
          accessibilityLabel="Confirm expense"
          style={({ pressed }) => ({
            position: 'absolute',
            bottom: TAB_BAR_HEIGHT + tokens.spacing.md,
            right: tokens.spacing.md,
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: isValid && !saving ? colors.primary.default : colors.text.tertiary,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.8 : 1,
            elevation: 4,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.2,
            shadowRadius: 4,
            zIndex: 10,
          })}
        >
          {saving
            ? <ActivityIndicator color="#fff" size="small" />
            : <Ionicons name="checkmark" size={28} color="#fff" />}
        </Pressable>
      )}

      {/* Currency dropdown overlay */}
      {currencyDropVisible && (
        <Pressable
          style={[styles.backdrop, { padding: tokens.spacing.xl }]}
          onPress={() => setCurrencyDropVisible(false)}
          accessibilityLabel="Close currency picker"
          accessibilityRole="button"
        >
          <View style={[styles.sheet, { backgroundColor: colors.surface, borderRadius: tokens.radius.card }]}>
            <View style={{ paddingHorizontal: tokens.spacing.md, paddingVertical: tokens.spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text variant="label" color={colors.text.secondary}>Entry currency</Text>
            </View>
            {CURRENCIES.map((item, index) => {
              const selected = item.code === (entryCurrency || tripCurrency);
              const isTripCcy = item.code === tripCurrency;
              return (
                <View key={item.code}>
                  {index > 0 && <View style={{ height: 1, backgroundColor: colors.borderMuted }} />}
                  <Pressable
                    onPress={() => { setEntryCurrency(item.code); setCurrencyDropVisible(false); }}
                    accessibilityRole="menuitem"
                    accessibilityState={{ selected }}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingHorizontal: tokens.spacing.md,
                      paddingVertical: tokens.spacing.md,
                      backgroundColor: pressed ? colors.surfaceAlt : selected ? colors.primary.subtle : 'transparent',
                    })}
                  >
                    <View>
                      <Text variant="body" color={selected ? colors.primary.default : colors.text.primary}>
                        {currencyLabel(item.code)}
                      </Text>
                      {isTripCcy && (
                        <Text variant="caption" color={colors.text.tertiary}>Trip currency</Text>
                      )}
                    </View>
                    {selected && <Ionicons name="checkmark" size={16} color={colors.primary.default} />}
                  </Pressable>
                </View>
              );
            })}
          </View>
        </Pressable>
      )}
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    zIndex: 100,
  },
  sheet: {
    overflow: 'hidden',
  },
});
