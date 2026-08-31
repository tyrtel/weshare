import React, { useState, useMemo } from 'react';
import {
  View, ScrollView, Pressable, TextInput, KeyboardAvoidingView,
  Platform, ActivityIndicator, StyleSheet,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ScreenWrapper } from '../../../components/ui/ScreenWrapper';
import { Text } from '../../../components/ui/Text';
import type { SplitMode } from '../components/SplitMemberRow';
import { useAddExpense } from '../hooks/useAddExpense';
import { useEditExpense } from '../hooks/useEditExpense';
import { useExpenseDetail } from '../hooks/useExpenseDetail';
import { useSplitForm } from '../hooks/useSplitForm';
import type { SplitFormEntry } from '../hooks/useSplitForm';
import { useCurrencyRate } from '../hooks/useCurrencyRate';
import { useCreateGroupExpense } from '../../groups/hooks/useCreateGroupExpense';
import { MakeRecurringSheet } from '../../groups/components/MakeRecurringSheet';
import { useTripDetail } from '../../trips/hooks/useTripDetail';
import { ReceiptCapture } from '../components/ReceiptCapture';
import { useTripSessionStore, useService } from '../../../core/di/ServiceContext';
import { AUTH } from '../../../core/di/tokens';
import { CURRENCIES, currencyLabel, currencySymbol, getMinorUnitMultiplier } from '../../../core/constants/currencies';
import { formatCurrency, formatRate } from '../../../core/utils/formatCurrency';
import type { Expense, ExpenseLineItem } from '../../../core/models/Expense';
import type { ParsedReceiptLineItem } from '../../../core/models/ParsedReceipt';
import type { SplitResult } from '../utils/splitCalculations';
import type { TripMember } from '../../../core/models/TripMember';
import type { GroupMember } from '../../../core/models/GroupMember';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColors, personColorFor } from '../../../theme/colors';
import type { ColorPalette } from '../../../theme/colors';
import { ledgerRadius, ledgerShadow, ledgerFonts } from '../../../theme/tokens';
import { Segmented } from '../../../components/ui/Segmented';
import { Avatar } from '../../../components/ui/Avatar';
import { HeaderConfirmButton } from '../../../components/ui/HeaderConfirmButton';

// ── Constants ─────────────────────────────────────────────────────────────────

const EMPTY_EXPENSES: never[] = [];

// ── Helpers ───────────────────────────────────────────────────────────────────

function sanitizeAmountInput(v: string): string {
  const cleaned = v.replace(/[^0-9.]/g, '');
  const firstDot = cleaned.indexOf('.');
  if (firstDot === -1) return cleaned;
  return cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
}

// Converts a typed major-unit amount into an integer minor-unit amount,
// respecting currencies with no subunit (e.g. JPY: "3555" -> 3555, not 355500).
function toMinorUnits(majorValue: string, currency: string): number {
  return Math.round((parseFloat(majorValue) || 0) * getMinorUnitMultiplier(currency));
}

// Inverse of toMinorUnits, for pre-filling an editable amount field.
function fromMinorUnits(minorUnits: number, currency: string): string {
  const multiplier = getMinorUnitMultiplier(currency);
  const value = minorUnits / multiplier;
  return multiplier === 1 ? String(value) : value.toFixed(2);
}

// A currency FX rate (e.g. "1 JPY = 0.0062 EUR") is expressed in major units;
// converting between minor-unit amounts must also rescale for differing
// subunit sizes (JPY has none, EUR has 100), or the result is off by 100x.
function currencyConversionRate(baseRate: number, fromCurrency: string, toCurrency: string): number {
  return baseRate * getMinorUnitMultiplier(toCurrency) / getMinorUnitMultiplier(fromCurrency);
}

// Members sharing a first initial get the shortest name prefix that tells them apart.
function initialCollisionLabels(members: TripMember[]): Record<string, string> {
  const groups = new Map<string, TripMember[]>();
  for (const m of members) {
    const initial = m.displayName.trim().charAt(0).toUpperCase();
    const group = groups.get(initial) ?? [];
    group.push(m);
    groups.set(initial, group);
  }

  const labels: Record<string, string> = {};
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    for (const m of group) {
      const words = m.displayName.trim().split(/\s+/);
      let label = words[0];
      for (let n = 1; n <= words.length; n++) {
        label = words.slice(0, n).join(' ');
        const stillColliding = group.some(other =>
          other.userId !== m.userId &&
          other.displayName.trim().split(/\s+/).slice(0, n).join(' ') === label,
        );
        if (!stillColliding) break;
      }
      labels[m.userId] = label;
    }
  }
  return labels;
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

// Same reasoning as scaleAndCorrect, applied to line items instead of splits —
// they're saved in context currency alongside the splits they were computed
// from, so a foreign-currency entry needs the same rescale-then-correct pass.
function scaleLineItems(items: ExpenseLineItem[], rate: number): ExpenseLineItem[] {
  const scaled = items.map(item => ({ ...item, amountCents: Math.round(item.amountCents * rate) }));
  const target = Math.round(items.reduce((sum, item) => sum + item.amountCents, 0) * rate);
  const diff   = target - scaled.reduce((sum, item) => sum + item.amountCents, 0);
  if (diff !== 0 && scaled.length > 0) {
    scaled[scaled.length - 1] = {
      ...scaled[scaled.length - 1],
      amountCents: scaled[scaled.length - 1].amountCents + diff,
    };
  }
  return scaled;
}

function groupMembersAsTripMembers(members: GroupMember[]): TripMember[] {
  return members.map(m => ({
    userId:      m.userId,
    tripId:      '',
    displayName: m.displayName,
    isGuest:     m.isGuest,
    joinedAt:    m.joinedAt,
    avatarUrl:   m.avatarUrl,
  }));
}

// ── Screen ────────────────────────────────────────────────────────────────────

export function ExpenseFormScreen() {
  const { t } = useTranslation();
  const { tripId, id: expenseId, groupId, recurring } = useLocalSearchParams<{ tripId?: string; id?: string; groupId?: string; recurring?: string }>();
  const router  = useRouter();
  const auth    = useService(AUTH);
  const colors  = useColors();
  const addStyles = useMemo(() => makeAddStyles(colors), [colors]);

  const mode           = expenseId ? 'edit' : 'add';
  // groupId (not the expenseId exclusion this used to carry) is what actually
  // distinguishes a group expense from a trip one — the edit route passes it
  // alongside id for a group expense, the same way it relies on expense.tripId
  // (rather than a tripId param) once loaded for a trip expense.
  const isGroupMode    = !!groupId && !tripId;
  const isRecurring    = mode === 'add' && isGroupMode && recurring === 'true';

  const [recurringSheetOpen,  setRecurringSheetOpen]  = useState(false);
  const [savedForRecurring,   setSavedForRecurring]   = useState<Expense | null>(null);

  // ── Data loading ─────────────────────────────────────────────────────────────

  // Group mode: read directly from the store (synchronous).
  const group = useTripSessionStore(s => groupId ? (s.groups.find(g => g.id === groupId) ?? null) : null);

  // Trip mode: load via hook. Pass '' in group mode so the hook is always called.
  const { expense, loading: expLoading } = useExpenseDetail(expenseId ?? '');
  const resolvedTripId = isGroupMode ? '' : (tripId ?? expense?.tripId ?? '');
  const { trip, loading: tripLoading }   = useTripDetail(resolvedTripId);

  // Trip expenses (for last-foreign-currency heuristic; unused in group mode).
  const tripExpenses = useTripSessionStore(
    s => (s.expenses as Record<string, typeof EMPTY_EXPENSES>)[resolvedTripId] ?? EMPTY_EXPENSES,
  );

  // ── Save hooks (always called; only one fires per submit) ─────────────────────

  const { addExpense,         loading: addLoading   } = useAddExpense(resolvedTripId);
  const { createGroupExpense, loading: groupLoading } = useCreateGroupExpense(groupId ?? '');
  const { editExpense,        loading: editLoading  } = useEditExpense();

  const saving = mode === 'edit' ? editLoading : isGroupMode ? groupLoading : addLoading;

  // ── Unified members + currency ────────────────────────────────────────────────

  const contextMembers: TripMember[] = useMemo(
    () => (isGroupMode ? groupMembersAsTripMembers(group?.members ?? []) : trip?.members ?? []),
    [isGroupMode, group?.members, trip?.members],
  );

  const contextCurrency = isGroupMode ? (group?.currency ?? 'EUR') : (trip?.currency ?? 'EUR');

  const payerLabels = useMemo(() => initialCollisionLabels(contextMembers), [contextMembers]);

  // ── Form state ────────────────────────────────────────────────────────────────

  const [description,         setDescription]         = useState('');
  const [totalAmountCents,    setTotalAmountCents]     = useState(0);
  const [category,            setCategory]            = useState<string | undefined>(undefined);
  const [paidByUserId,        setPaidByUserId]         = useState('');
  const [entryCurrency,       setEntryCurrency]       = useState('');
  const [currencyDropVisible, setCurrencyDropVisible] = useState(false);
  const [initialised,         setInitialised]         = useState(false);
  const [receiptPath,         setReceiptPath]         = useState<string | undefined>(undefined);
  const [rawAmount,           setRawAmount]           = useState('');
  // Raw text the user is typing per exact-split member / itemized item, keyed
  // by userId / line-item id. Kept separate from the parsed cents value so the
  // input isn't reformatted (and doesn't drop focus) mid-keystroke.
  const [exactRaw, setExactRaw] = useState<Record<string, string>>({});
  const [itemRaw,  setItemRaw]  = useState<Record<string, string>>({});

  // Render-phase initialisation — fires once when the necessary data arrives.
  if (!initialised) {
    if (mode === 'add' && isGroupMode && group) {
      if (group.members.length > 0) setPaidByUserId(group.members[0].userId);
      setEntryCurrency(group.currency);
      setInitialised(true);
    } else if (mode === 'add' && !isGroupMode && trip) {
      if (trip.members.length > 0) setPaidByUserId(trip.members[0].userId);
      const lastForeign = [...tripExpenses]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .find(e => e.metadata?.originalAmount)
        ?.metadata?.originalAmount?.currency ?? null;
      setEntryCurrency(lastForeign ?? trip.currency);
      setInitialised(true);
    } else if (mode === 'edit' && expense && (isGroupMode ? group : trip)) {
      setDescription(expense.description);
      setTotalAmountCents(expense.metadata.originalAmount?.amountCents ?? expense.totalAmountCents);
      setEntryCurrency(expense.metadata.originalAmount?.currency ?? contextCurrency);
      setCategory(expense.metadata.category);
      setPaidByUserId(expense.paidByUserId);
      setReceiptPath(expense.metadata.receiptUrl);
      setInitialised(true);
    }
  }

  const isForeign      = entryCurrency !== '' && entryCurrency !== contextCurrency;
  const rate           = useCurrencyRate(entryCurrency || contextCurrency, contextCurrency);

  const convertedCents = useMemo(() => {
    if (!isForeign || !rate.result) return totalAmountCents;
    return Math.round(totalAmountCents * currencyConversionRate(rate.result.rate, entryCurrency, contextCurrency));
  }, [isForeign, totalAmountCents, rate.result, entryCurrency, contextCurrency]);

  // Pre-fill splits from existing expense when in edit mode. The split form
  // always works in entry-currency terms (see useSplitForm call below), but
  // saved splits are stored in context currency — reconstruct the original
  // entry-currency amount using the exchange rate captured at save time.
  const initialEntries: SplitFormEntry[] | undefined = useMemo(() => {
    if (mode !== 'edit' || !expense || (isGroupMode ? !group : !trip)) return undefined;
    const orig = expense.metadata.originalAmount;
    return contextMembers.map(m => {
      const s = expense.splits.find(sp => sp.userId === m.userId);
      if (!s) return { userId: m.userId, included: false, customAmountCents: null };
      const customAmountCents = orig
        ? Math.round(s.amountOwedCents / currencyConversionRate(orig.exchangeRate, orig.currency, contextCurrency))
        : s.amountOwedCents;
      return { userId: m.userId, included: true, customAmountCents };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, expense?.id, trip?.id, group?.id, isGroupMode]);

  // Same reconstruction as initialEntries above, for an itemized expense's
  // line items — without this, re-opening one for edit silently drops back
  // to "custom" mode and the items disappear.
  const initialLineItems: ExpenseLineItem[] | undefined = useMemo(() => {
    if (mode !== 'edit' || !expense || (isGroupMode ? !group : !trip)) return undefined;
    const items = expense.metadata.lineItems;
    if (!items || items.length === 0) return undefined;
    const orig = expense.metadata.originalAmount;
    if (!orig) return items;
    const rate = currencyConversionRate(orig.exchangeRate, orig.currency, contextCurrency);
    return items.map(item => ({ ...item, amountCents: Math.round(item.amountCents / rate) }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, expense?.id, trip?.id, group?.id, isGroupMode]);

  const initialSplitMode: SplitMode | undefined = mode === 'edit'
    ? ((expense?.metadata.lineItems?.length ?? 0) > 0 ? 'itemized' : 'custom')
    : undefined;

  const split = useSplitForm({
    members:          contextMembers,
    totalAmountCents,
    initialEntries,
    initialLineItems,
    initialMode:      initialSplitMode,
    ready:            mode === 'edit' ? (!!expense && (isGroupMode ? !!group : !!trip)) : undefined,
  });

  const isItemized        = split.splitMode === 'itemized';
  // Members without an explicit amount silently absorb the remainder at save
  // time (see computeSplitInputs), so `split.remainder` is nearly always 0.
  // "Unassigned" instead reflects only what's been explicitly typed so far.
  const assignedCents = split.splitEntries
    .filter(e => e.included && e.customAmountCents !== null)
    .reduce((s, e) => s + (e.customAmountCents ?? 0), 0);
  const unassignedCents = totalAmountCents - assignedCents;
  // Itemized mode's equivalent: the top total minus the items entered so far
  // (mirrors Exact mode — new items default to "assigned to everyone", so
  // tracking assignment status here would almost never show anything).
  const unassignedItemsCents = totalAmountCents - split.itemizedTotal;
  const enteredTotal   = isItemized ? split.itemizedTotal : totalAmountCents;
  const effectiveTotal = !isForeign || !rate.result
    ? enteredTotal
    : Math.round(enteredTotal * currencyConversionRate(rate.result.rate, entryCurrency, contextCurrency));

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
    if (parsedLineItems.length > 0 && contextMembers.length > 0) {
      split.initFromParsed(parsedLineItems, contextMembers);
    } else if (amountCents > 0) {
      setTotalAmountCents(amountCents);
    }
  };

  const handleSubmit = async () => {
    // The split form always works in entry-currency terms (see the
    // useSplitForm call above), so every mode's computedSplits needs this
    // single conversion pass to land in context currency.
    const rawSplits   = split.computedSplits;
    const finalSplits = isForeign && rate.result
      ? scaleAndCorrect(rawSplits, currencyConversionRate(rate.result.rate, entryCurrency, contextCurrency), effectiveTotal)
      : rawSplits;

    const finalLineItems = isItemized
      ? (isForeign && rate.result
        ? scaleLineItems(split.lineItems, currencyConversionRate(rate.result.rate, entryCurrency, contextCurrency))
        : split.lineItems)
      : undefined;

    const originalAmount = isForeign && rate.result
      ? { amountCents: enteredTotal, currency: entryCurrency, exchangeRate: rate.result.rate, source: rate.result.source }
      : undefined;

    const input = {
      description,
      totalAmountCents: effectiveTotal,
      currency:         contextCurrency,
      paidByUserId,
      splits:           finalSplits,
      category,
      receiptUrl:       receiptPath,
      lineItems:        finalLineItems,
      originalAmount,
    };

    let saved = null;
    if (isGroupMode && mode === 'add') {
      saved = await createGroupExpense(input);
      if (saved && isRecurring) {
        setSavedForRecurring(saved);
        setRecurringSheetOpen(true);
        return;
      }
    } else if (mode === 'add') {
      saved = await addExpense(input);
    } else if (expense) {
      // editExpense is generic over trip vs group expenses — it just carries
      // existing.groupId/tripId through, and the store routes the update to
      // whichever cache bucket actually holds the expense.
      saved = await editExpense(expense, input);
    }

    if (saved) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)');
    }
  };

  // ── Styles ───────────────────────────────────────────────────────────────────

  const expenseCurrency = entryCurrency || contextCurrency;

  // Renders "(€12.34)" in the trip/group currency next to a split amount
  // that's entered in a foreign currency; null when there's nothing to show.
  const convertedLabel = (amountMinor: number): string | null => {
    if (!isForeign || !rate.result || amountMinor === 0) return null;
    const converted = Math.round(amountMinor * currencyConversionRate(rate.result.rate, entryCurrency, contextCurrency));
    return `(${formatCurrency(converted, contextCurrency)})`;
  };

  // ── Loading state ────────────────────────────────────────────────────────────

  const isLoading = isGroupMode
    ? !group || (mode === 'edit' && (expLoading || !expense))
    : tripLoading || (mode === 'edit' && expLoading) || !trip || (mode === 'edit' && !expense);

  const title = mode === 'edit'
    ? t('expenses.form.edit_title')
    : isGroupMode ? t('groups.expense.add_title') : t('expenses.form.add_title');

  if (isLoading) {
    return (
      <ScreenWrapper>
        <Stack.Screen options={{ title }} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary.default} />
        </View>
      </ScreenWrapper>
    );
  }

  return (
    <>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.background }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView edges={['top']} style={{ backgroundColor: colors.background }}>
          <View style={addStyles.titleRow}>
            <Pressable onPress={() => router.back()} hitSlop={10}>
              <Feather name="x" size={24} color={colors.text.primary} />
            </Pressable>
            <Text style={addStyles.screenTitle}>{t('expenses.form.screen_title')}</Text>
            <HeaderConfirmButton
              onPress={handleSubmit}
              disabled={!isValid || saving}
              loading={saving}
              accessibilityLabel={t('expenses.form.confirm_label')}
            />
          </View>
        </SafeAreaView>

        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: 80 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <ReceiptCapture
            onParsed={handleParsed}
            tripId={resolvedTripId || undefined}
            disabled={saving}
            style={{ marginBottom: 12 }}
          />

          {/* Amount + title card */}
          <View style={addStyles.card}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 4 }}>
              <Pressable
                onPress={() => setCurrencyDropVisible(true)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
                hitSlop={8}
              >
                <Text style={addStyles.currency}>{currencySymbol(expenseCurrency)}</Text>
                <Feather name="chevron-down" size={14} color={colors.text.tertiary} />
              </Pressable>
              <TextInput
                testID="expense-amount-input"
                style={addStyles.amountInput}
                value={rawAmount}
                onChangeText={v => {
                  const cleaned = sanitizeAmountInput(v);
                  setRawAmount(cleaned);
                  setTotalAmountCents(toMinorUnits(cleaned, expenseCurrency));
                }}
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
                    <Text style={addStyles.rateText}>{t('expenses.form.rate_fetching')}</Text>
                  </>
                ) : rate.error ? (
                  <>
                    <Feather name="alert-triangle" size={12} color={colors.warning.default} />
                    <Text style={[addStyles.rateText, { color: colors.warning.default }]}>{t('expenses.form.rate_unavailable')}</Text>
                    <Pressable onPress={rate.refresh} hitSlop={8}>
                      <Text style={[addStyles.rateText, { color: colors.primary.default, fontWeight: '600' }]}>{t('common.retry')}</Text>
                    </Pressable>
                  </>
                ) : rate.result ? (
                  <Text style={addStyles.rateText}>
                    {`1 ${entryCurrency} = ${formatRate(rate.result.rate)} ${contextCurrency}${convertedCents > 0 ? ` · ${formatCurrency(convertedCents, contextCurrency)}` : ''}${rate.result.source === 'approximate' ? ' · approx.' : ''}`}
                  </Text>
                ) : null}
              </View>
            )}
            <TextInput
              testID="expense-description-input"
              style={addStyles.titleInput}
              value={description}
              onChangeText={setDescription}
              placeholder={t('expenses.form.title_placeholder')}
              placeholderTextColor={colors.text.tertiary}
            />
          </View>

          {/* Paid by */}
          <Text style={addStyles.fieldLabel}>{t('expenses.form.paid_by_label')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
            {contextMembers.map(m => {
              const active = paidByUserId === m.userId;
              const palette = personColorFor(m.userId, contextMembers);
              const label = payerLabels[m.userId];
              return (
                <Pressable
                  key={m.userId}
                  testID={`payer-select-${m.userId}`}
                  accessibilityRole="button"
                  accessibilityLabel={t('expenses.form.paid_by_select_label', { name: m.displayName })}
                  accessibilityState={{ selected: active }}
                  onPress={() => setPaidByUserId(m.userId)}
                  style={{ alignItems: 'center', gap: 4, opacity: active ? 1 : 0.5 }}
                >
                  <View style={{
                    borderWidth: active ? 2 : 0, borderColor: colors.primary.default,
                    borderRadius: 999, padding: active ? 2 : 0,
                  }}>
                    <Avatar initials={m.displayName} bg={palette.bg} url={m.avatarUrl} size="lg" />
                  </View>
                  {label && (
                    <Text
                      style={{ fontSize: 11, fontWeight: '500', color: active ? colors.primary.default : colors.text.secondary, maxWidth: 64 }}
                      numberOfLines={1}
                    >
                      {label}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </View>

          {/* Split mode segmented control */}
          <Text style={addStyles.fieldLabel}>{t('expenses.form.split_label')}</Text>
          <Segmented
            value={split.splitMode}
            onChange={k => {
              split.handleSetMode(k as SplitMode);
              setExactRaw({});
              setItemRaw({});
            }}
            options={[
              { key: 'equal',    label: t('expenses.form.segmented_evenly') },
              { key: 'custom',   label: t('expenses.form.segmented_exact') },
              { key: 'itemized', label: t('expenses.form.segmented_items') },
            ]}
          />

          <View style={{ height: 12 }} />

          {/* Equal mode */}
          {split.splitMode === 'equal' && (
            <View style={addStyles.card}>
              {split.splitEntries.map((entry, i) => {
                const member = contextMembers.find(m => m.userId === entry.userId);
                if (!member) return null;
                const includedCount = split.splitEntries.filter(e => e.included).length;
                const share = entry.included && includedCount > 0
                  ? Math.round(totalAmountCents / includedCount)
                  : 0;
                return (
                  <View key={entry.userId}>
                    {i > 0 && <View style={addStyles.rowDivider} />}
                    <Pressable style={addStyles.splitRow} onPress={() => split.handleToggleMember(entry.userId)}>
                      <View style={[addStyles.check, entry.included && addStyles.checkOn]}>
                        {entry.included && <Feather name="check" size={13} color={colors.text.inverse} />}
                      </View>
                      <Avatar
                        initials={member.displayName}
                        bg={personColorFor(member.userId, contextMembers).bg}
                        url={member.avatarUrl}
                        size="sm"
                      />
                      <Text style={addStyles.splitName}>{member.displayName}</Text>
                      <Text style={[addStyles.splitAmount, { color: entry.included ? colors.text.primary : colors.text.tertiary }]}>
                        {formatCurrency(share, expenseCurrency)}
                        {convertedLabel(share) && (
                          <Text style={addStyles.convertedAmount}> {convertedLabel(share)}</Text>
                        )}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          )}

          {/* Custom (exact) mode */}
          {split.splitMode === 'custom' && (
            <View style={addStyles.card}>
              {split.splitEntries.map((entry, i) => {
                const member = contextMembers.find(m => m.userId === entry.userId);
                if (!member) return null;
                const displayVal = exactRaw[entry.userId] ?? (
                  entry.customAmountCents != null && entry.customAmountCents > 0
                    ? fromMinorUnits(entry.customAmountCents, expenseCurrency) : ''
                );
                return (
                  <View key={entry.userId}>
                    {i > 0 && <View style={addStyles.rowDivider} />}
                    <View style={addStyles.splitRow}>
                      <Avatar
                        initials={member.displayName}
                        bg={personColorFor(member.userId, contextMembers).bg}
                        url={member.avatarUrl}
                        size="sm"
                      />
                      <Text style={[addStyles.splitName, { flex: 1 }]}>{member.displayName}</Text>
                      <View style={{ alignItems: 'flex-end' }}>
                        <View style={addStyles.exactBox}>
                          <Text style={{ fontSize: 14, color: colors.text.secondary }}>
                            {currencySymbol(expenseCurrency)}
                          </Text>
                          <TextInput
                            testID={`exact-amount-input-${entry.userId}`}
                            style={addStyles.exactInput}
                            keyboardType="decimal-pad"
                            placeholder="0.00"
                            placeholderTextColor={colors.text.tertiary}
                            value={displayVal}
                            onChangeText={v => {
                              const cleaned = sanitizeAmountInput(v);
                              setExactRaw(prev => ({ ...prev, [entry.userId]: cleaned }));
                              split.handleChangeAmount(entry.userId, toMinorUnits(cleaned, expenseCurrency));
                            }}
                          />
                        </View>
                        {convertedLabel(entry.customAmountCents ?? 0) && (
                          <Text style={[addStyles.convertedAmount, { marginTop: 2 }]}>
                            {convertedLabel(entry.customAmountCents ?? 0)}
                          </Text>
                        )}
                      </View>
                    </View>
                  </View>
                );
              })}
              <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 8 }} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 13, fontWeight: '500', color: colors.text.secondary }}>
                  {t('expenses.form.unassigned_label')}
                </Text>
                <Text style={[addStyles.splitAmount, {
                  color: unassignedCents === 0 ? colors.success.default : colors.error.default,
                }]}>
                  {formatCurrency(unassignedCents, expenseCurrency)}
                  {convertedLabel(unassignedCents) && (
                    <Text style={addStyles.convertedAmount}> {convertedLabel(unassignedCents)}</Text>
                  )}
                </Text>
              </View>
            </View>
          )}

          {/* Itemized mode */}
          {split.splitMode === 'itemized' && (
            <View style={[addStyles.card, { padding: 20 }]}>
              <Text style={[addStyles.fieldLabel, { textAlign: 'center', marginTop: 0, marginBottom: 4 }]}>
                {description.toUpperCase() || t('expenses.form.receipt_fallback')}
              </Text>
              <Text style={{ fontSize: 11.5, color: colors.text.tertiary, textAlign: 'center', marginBottom: 8 }}>
                {t('expenses.form.itemized_hint')}
              </Text>
              <View style={{ borderBottomWidth: 1, borderStyle: 'dashed', borderColor: colors.borderMuted, marginBottom: 12 }} />
              {split.lineItems.map((item, i) => (
                <View key={item.id}>
                  {i > 0 && <View style={[addStyles.rowDivider, { marginBottom: 12 }]} />}
                  <View style={{ marginBottom: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <TextInput
                        testID={`item-description-input-${item.id}`}
                        style={{ flex: 1, fontSize: 14, fontWeight: '500', color: colors.text.primary, paddingVertical: 2 }}
                        value={item.description}
                        onChangeText={v => split.updateLineItem(item.id, { description: v })}
                        placeholder={t('expenses.line_item.placeholder')}
                        placeholderTextColor={colors.text.tertiary}
                      />
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                        <Text style={{ fontSize: 14, color: colors.text.secondary }}>
                          {currencySymbol(expenseCurrency)}
                        </Text>
                        <TextInput
                          testID={`item-amount-input-${item.id}`}
                          style={{ fontSize: 14, color: colors.text.primary, minWidth: 56, textAlign: 'right', paddingVertical: 2 }}
                          keyboardType="decimal-pad"
                          placeholder="0.00"
                          placeholderTextColor={colors.text.tertiary}
                          value={itemRaw[item.id] ?? (item.amountCents > 0 ? fromMinorUnits(item.amountCents, expenseCurrency) : '')}
                          onChangeText={v => {
                            const cleaned = sanitizeAmountInput(v);
                            setItemRaw(prev => ({ ...prev, [item.id]: cleaned }));
                            split.updateLineItem(item.id, { amountCents: toMinorUnits(cleaned, expenseCurrency) });
                          }}
                        />
                      </View>
                      <Pressable testID={`item-remove-button-${item.id}`} onPress={() => split.removeLineItem(item.id)} hitSlop={8}>
                        <Feather name="x" size={16} color={colors.text.tertiary} />
                      </Pressable>
                    </View>
                    {convertedLabel(item.amountCents) && (
                      <Text style={[addStyles.convertedAmount, { textAlign: 'right', marginTop: 2 }]}>
                        {convertedLabel(item.amountCents)}
                      </Text>
                    )}
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                      {contextMembers.map(m => {
                        const on = item.assignedUserIds.includes(m.userId);
                        const palette = personColorFor(m.userId, contextMembers);
                        return (
                          <Pressable
                            key={m.userId}
                            onPress={() => split.toggleMemberInItem(item.id, m.userId)}
                            style={{ opacity: on ? 1 : 0.4 }}
                          >
                            <View style={{
                              borderWidth: on ? 2 : 1.5,
                              borderColor: on ? colors.primary.default : colors.text.tertiary,
                              borderRadius: 999,
                              padding: on ? 1 : 1.5,
                            }}>
                              <Avatar initials={m.displayName} bg={palette.bg} url={m.avatarUrl} size="xs" />
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                </View>
              ))}
              {split.lineItems.length > 0 && (
                <>
                  <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 8 }} />
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 13, fontWeight: '500', color: colors.text.secondary }}>
                      {t('expenses.form.unassigned_label')}
                    </Text>
                    <Text style={[addStyles.splitAmount, {
                      color: unassignedItemsCents === 0 ? colors.success.default : colors.error.default,
                    }]}>
                      {formatCurrency(unassignedItemsCents, expenseCurrency)}
                      {convertedLabel(unassignedItemsCents) && (
                        <Text style={addStyles.convertedAmount}> {convertedLabel(unassignedItemsCents)}</Text>
                      )}
                    </Text>
                  </View>
                </>
              )}
              <Pressable
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, marginTop: split.lineItems.length > 0 ? 8 : 0 }}
                onPress={split.addLineItem}
              >
                <Feather name="plus" size={14} color={colors.primary.default} />
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primary.default }}>{t('expenses.form.add_line_item')}</Text>
              </Pressable>
            </View>
          )}

          <View style={{ height: 20 }} />

          {/* Save button */}
          <Pressable
            onPress={isValid ? handleSubmit : undefined}
            disabled={!isValid || saving}
            style={({ pressed }) => [
              addStyles.saveBtn,
              { opacity: (!isValid || saving) ? 0.5 : pressed ? 0.85 : 1 },
            ]}
          >
            {saving ? (
              <ActivityIndicator color={colors.text.inverse} />
            ) : (
              <>
                <Feather name="check" size={18} color={colors.text.inverse} />
                <Text style={{ color: colors.text.inverse, fontWeight: '600', fontSize: 16 }}>{t('expenses.form.save_button')}</Text>
              </>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      {currencyDropVisible && (
        <Pressable
          style={addStyles.backdrop}
          onPress={() => setCurrencyDropVisible(false)}
          accessibilityLabel={t('expenses.form.currency_close_label')}
          accessibilityRole="button"
        >
          <Pressable style={addStyles.currencySheet} onPress={() => {}}>
            <View style={addStyles.currencySheetHeader}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                {t('expenses.form.currency_sheet_title')}
              </Text>
            </View>
            <ScrollView>
              {CURRENCIES.map((item, index) => {
                const selected     = item.code === expenseCurrency;
                const isContextCcy = item.code === contextCurrency;
                return (
                  <View key={item.code}>
                    {index > 0 && <View style={{ height: 1, backgroundColor: colors.border }} />}
                    <Pressable
                      onPress={() => {
                        const newCode = item.code;
                        if (newCode !== expenseCurrency) {
                          const scale = getMinorUnitMultiplier(newCode) / getMinorUnitMultiplier(expenseCurrency);
                          if (scale !== 1) {
                            const newTotal = Math.round(totalAmountCents * scale);
                            setTotalAmountCents(newTotal);
                            if (rawAmount !== '') setRawAmount(fromMinorUnits(newTotal, newCode));
                            setExactRaw({});
                            setItemRaw({});
                            split.rescaleForCurrency(scale);
                          }
                        }
                        setEntryCurrency(newCode);
                        setCurrencyDropVisible(false);
                      }}
                      accessibilityRole="menuitem"
                      accessibilityState={{ selected }}
                      style={({ pressed }) => [
                        addStyles.currencyRow,
                        { backgroundColor: pressed ? colors.surfaceAlt : selected ? colors.primary.subtle : 'transparent' },
                      ]}
                    >
                      <View>
                        <Text style={{ fontSize: 15, color: selected ? colors.primary.default : colors.text.primary }}>
                          {currencyLabel(item.code)}
                        </Text>
                        {isContextCcy && (
                          <Text style={{ fontSize: 11, color: colors.text.tertiary, marginTop: 1 }}>
                            {isGroupMode ? t('expenses.form.currency_sheet_group_currency') : t('expenses.form.currency_sheet_trip_currency')}
                          </Text>
                        )}
                      </View>
                      {selected && <Feather name="check" size={16} color={colors.primary.default} />}
                    </Pressable>
                  </View>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      )}

      {isRecurring && recurringSheetOpen && savedForRecurring && (
        <MakeRecurringSheet
          visible={recurringSheetOpen}
          expense={savedForRecurring}
          groupId={groupId!}
          createdByUserId={auth.currentUser()?.id ?? ''}
          onClose={() => {
            setRecurringSheetOpen(false);
            if (router.canGoBack()) router.back();
            else router.replace('/(tabs)');
          }}
          onSuccess={() => {
            setRecurringSheetOpen(false);
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            if (router.canGoBack()) router.back();
            else router.replace('/(tabs)');
          }}
        />
      )}
    </>
  );
}
const makeAddStyles = (colors: ColorPalette) => StyleSheet.create({
  titleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12,
  },
  screenTitle: { fontFamily: ledgerFonts.display, fontSize: 19, color: colors.text.primary },
  card: {
    backgroundColor: colors.surface,
    borderRadius: ledgerRadius.card,
    padding: 16,
    ...ledgerShadow.card,
  },
  // lineHeight is set explicitly (rather than left to the platform default)
  // on every style below that renders the amount — SpaceGrotesk's line box at
  // these sizes runs tight against its own glyph metrics, and device testing
  // showed the hero amount getting its top/bottom pixels clipped without it.
  currency: { fontFamily: ledgerFonts.displaySemibold, fontSize: 26, lineHeight: 32, color: colors.text.secondary },
  amountInput: {
    fontFamily: ledgerFonts.display,
    fontSize: 44, lineHeight: 52, color: colors.text.primary,
    minWidth: 140, paddingHorizontal: 4, textAlign: 'center',
  },
  titleInput: {
    fontSize: 15, color: colors.text.primary, textAlign: 'center',
    borderTopWidth: 1, borderColor: colors.border,
    paddingTop: 12, marginTop: 8,
  },
  fieldLabel: {
    fontSize: 12, fontWeight: '600', color: colors.text.secondary,
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginTop: 20, marginBottom: 8,
  },
  rateText: { fontSize: 12, color: colors.text.secondary },
  splitRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowDivider: { height: 1, backgroundColor: colors.border },
  splitName: { fontSize: 14.5, fontWeight: '500', color: colors.text.primary, flex: 1 },
  splitAmount: { fontFamily: ledgerFonts.displaySemibold, fontSize: 14, lineHeight: 20, color: colors.text.primary, fontVariant: ['tabular-nums'] },
  convertedAmount: { fontFamily: ledgerFonts.body, fontSize: 11, lineHeight: 16, fontWeight: '400', color: colors.text.tertiary, fontVariant: ['tabular-nums'] },
  check: {
    width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: colors.borderMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.primary.default, borderColor: colors.primary.default },
  exactBox: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: colors.background, borderRadius: ledgerRadius.sm, paddingHorizontal: 10, height: 38,
  },
  exactInput: { fontSize: 15, lineHeight: 22, fontWeight: '500', color: colors.text.primary, minWidth: 62, textAlign: 'right' },
  saveBtn: {
    flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 15, borderRadius: ledgerRadius.md,
    backgroundColor: colors.primary.default,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  currencySheet: {
    backgroundColor: colors.surface,
    borderRadius: ledgerRadius.card,
    overflow: 'hidden',
    maxHeight: '70%',
    ...ledgerShadow.card,
  },
  currencySheetHeader: {
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  currencyRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
  },
});
