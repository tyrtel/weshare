import React, { useState, useMemo } from 'react';
import {
  View, ScrollView, Pressable, KeyboardAvoidingView,
  Platform, ActivityIndicator,
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
import { ExpenseAmountCard } from '../components/ExpenseAmountCard';
import { PayerPicker } from '../components/PayerPicker';
import { SplitModeSection } from '../components/SplitModeSection';
import { LineItemEntryList } from '../components/LineItemEntryList';
import { ExpenseSummaryHeader } from '../components/ExpenseSummaryHeader';
import { useTripSessionStore, useService } from '../../../core/di/ServiceContext';
import { AUTH } from '../../../core/di/tokens';
import { CURRENCIES, currencyLabel, getMinorUnitMultiplier } from '../../../core/constants/currencies';
import { formatCurrency } from '../../../core/utils/formatCurrency';
import type { Expense, ExpenseLineItem } from '../../../core/models/Expense';
import type { ParsedReceiptLineItem } from '../../../core/models/ParsedReceipt';
import type { SplitResult } from '../utils/splitCalculations';
import type { TripMember } from '../../../core/models/TripMember';
import type { GroupMember } from '../../../core/models/GroupMember';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColors } from '../../../theme/colors';
import { HeaderConfirmButton } from '../../../components/ui/HeaderConfirmButton';
import { makeExpenseFormStyles } from './expenseFormStyles';

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
  const addStyles = useMemo(() => makeExpenseFormStyles(colors), [colors]);

  const mode           = expenseId ? 'edit' : 'add';
  // groupId (not the expenseId exclusion this used to carry) is what actually
  // distinguishes a group expense from a trip one — the edit route passes it
  // alongside id for a group expense, the same way it relies on expense.tripId
  // (rather than a tripId param) once loaded for a trip expense.
  const isGroupMode    = !!groupId && !tripId;
  const isRecurring    = mode === 'add' && isGroupMode && recurring === 'true';

  const [recurringSheetOpen,  setRecurringSheetOpen]  = useState(false);
  const [savedForRecurring,   setSavedForRecurring]   = useState<Expense | null>(null);

  // Add mode only — a two-step "details, then split" flow inside the same
  // modal. Edit mode ignores this and always renders everything at once (see
  // the plan doc: lower risk to an already-tested single-screen flow, and
  // trip vs. group expenses share this exact component so both get the
  // two-step flow identically — isGroupMode only ever picks the save hook).
  const [step, setStep] = useState<'details' | 'split'>('details');

  // ── Data loading ─────────────────────────────────────────────────────────────

  // Group mode: read directly from the store (synchronous).
  const group = useTripSessionStore(s => groupId ? (s.groups.find(g => g.id === groupId) ?? null) : null);

  // Trip mode: load via hook. Pass '' in group mode so the hook is always called.
  const { expense, loading: expLoading } = useExpenseDetail(expenseId ?? '');
  const resolvedTripId = isGroupMode ? '' : (tripId ?? expense?.tripId ?? '');
  const { trip, loading: tripLoading }   = useTripDetail(resolvedTripId);

  // Trip expenses (for last-foreign-currency heuristic; unused in group mode).
  const tripExpenses = useTripSessionStore(
    s => s.expenses[resolvedTripId] ?? EMPTY_EXPENSES,
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
  const enteredTotal   = isItemized ? split.itemizedTotal : totalAmountCents;
  const effectiveTotal = !isForeign || !rate.result
    ? enteredTotal
    : Math.round(enteredTotal * currencyConversionRate(rate.result.rate, entryCurrency, contextCurrency));

  const hasValidRate = !isForeign || rate.result !== null;

  // Gates step 1's Continue button (add mode) — everything needed to know
  // *what* the expense is, before moving on to *how* it's split.
  const detailsValid =
    description.trim().length > 0 &&
    effectiveTotal > 0 &&
    hasValidRate &&
    !rate.loading;

  const isValid =
    detailsValid &&
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
    if (path) setReceiptPath(path);
    if (parsedLineItems.length > 0 && contextMembers.length > 0) {
      split.initFromParsed(parsedLineItems, contextMembers);
    } else if (amountCents > 0) {
      setTotalAmountCents(amountCents);
    }
  };

  // Step 1's "enter as one amount" / "break into items" toggle. Reuses
  // split.splitMode itself rather than a second piece of state — see the
  // plan doc's "Design" section.
  const handleToggleItemized = () => {
    if (isItemized) {
      split.handleSetMode('custom');
      setRawAmount('');
      setTotalAmountCents(0);
    } else {
      split.handleSetMode('itemized');
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

  // ── Derived display values ──────────────────────────────────────────────────

  const expenseCurrency = entryCurrency || contextCurrency;

  // Renders "(€12.34)" in the trip/group currency next to a split amount
  // that's entered in a foreign currency; null when there's nothing to show.
  const convertedLabel = (amountMinor: number): string | null => {
    if (!isForeign || !rate.result || amountMinor === 0) return null;
    const converted = Math.round(amountMinor * currencyConversionRate(rate.result.rate, entryCurrency, contextCurrency));
    return `(${formatCurrency(converted, contextCurrency)})`;
  };

  const handleAmountChange = (v: string) => {
    const cleaned = sanitizeAmountInput(v);
    setRawAmount(cleaned);
    setTotalAmountCents(toMinorUnits(cleaned, expenseCurrency));
  };

  const handleCurrencySelect = (newCode: string) => {
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

  const showingDetailsStep = mode === 'edit' || step === 'details';
  const showingSplitStep   = mode === 'edit' || step === 'split';
  const splitModes: SplitMode[] = mode === 'edit'
    ? ['equal', 'custom', 'itemized']
    : split.lineItems.length > 0 ? ['equal', 'custom', 'itemized'] : ['equal', 'custom'];

  return (
    <>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.background }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView edges={['top']} style={{ backgroundColor: colors.background }}>
          <View style={addStyles.titleRow}>
            {mode === 'add' && step === 'split' ? (
              <Pressable testID="expense-back-button" onPress={() => setStep('details')} hitSlop={10}
                accessibilityRole="button" accessibilityLabel={t('expenses.form.back_button_label')}>
                <Feather name="chevron-left" size={24} color={colors.text.primary} />
              </Pressable>
            ) : (
              <Pressable onPress={() => router.back()} hitSlop={10}>
                <Feather name="x" size={24} color={colors.text.primary} />
              </Pressable>
            )}
            <View style={{ alignItems: 'center' }}>
              <Text style={addStyles.screenTitle}>{t('expenses.form.screen_title')}</Text>
              {mode === 'add' && (
                <Text style={addStyles.stepIndicator}>
                  {step === 'details' ? t('expenses.form.step1_of_2') : t('expenses.form.step2_of_2')}
                </Text>
              )}
            </View>
            {mode === 'add' && step === 'details' ? (
              <HeaderConfirmButton
                testID="expense-continue-button"
                onPress={() => setStep('split')}
                disabled={!detailsValid}
                loading={false}
                icon="arrow-forward"
                accessibilityLabel={t('expenses.form.continue_button_label')}
              />
            ) : (
              <HeaderConfirmButton
                onPress={handleSubmit}
                disabled={!isValid || saving}
                loading={saving}
                accessibilityLabel={t('expenses.form.confirm_label')}
              />
            )}
          </View>
        </SafeAreaView>

        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: 80 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {showingDetailsStep && (
            <>
              <ReceiptCapture
                onParsed={handleParsed}
                tripId={resolvedTripId || undefined}
                disabled={saving}
                style={{ marginBottom: 12 }}
              />

              <ExpenseAmountCard
                currency={expenseCurrency}
                amount={isItemized
                  ? { editable: false, totalCents: split.itemizedTotal }
                  : { editable: true, rawAmount, onChangeAmount: handleAmountChange }}
                onPressCurrency={() => setCurrencyDropVisible(true)}
                description={description}
                onChangeDescription={setDescription}
                isForeign={isForeign}
                rate={rate}
                entryCurrency={entryCurrency}
                contextCurrency={contextCurrency}
                convertedCents={convertedCents}
              />

              {mode === 'add' && (
                <Pressable
                  testID="expense-itemize-toggle"
                  onPress={handleToggleItemized}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, alignSelf: 'center' }}
                >
                  <Feather name={isItemized ? 'hash' : 'list'} size={13} color={colors.primary.default} />
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primary.default }}>
                    {isItemized ? t('expenses.form.single_amount_instead') : t('expenses.form.break_into_items')}
                  </Text>
                </Pressable>
              )}

              {mode === 'add' && isItemized && (
                <LineItemEntryList
                  items={split.lineItems}
                  currency={expenseCurrency}
                  itemRaw={itemRaw}
                  setItemRaw={setItemRaw}
                  onUpdateItem={split.updateLineItem}
                  onRemoveItem={split.removeLineItem}
                  onAddItem={split.addLineItem}
                  fromMinorUnits={fromMinorUnits}
                  toMinorUnits={toMinorUnits}
                  sanitizeAmountInput={sanitizeAmountInput}
                />
              )}
            </>
          )}

          {showingSplitStep && (
            <>
              {mode === 'add' && (
                <ExpenseSummaryHeader
                  description={description}
                  totalAmountCents={enteredTotal}
                  currency={expenseCurrency}
                  itemCount={split.lineItems.length}
                  onPress={() => setStep('details')}
                />
              )}

              <PayerPicker
                members={contextMembers}
                paidByUserId={paidByUserId}
                onSelect={setPaidByUserId}
                labels={payerLabels}
              />

              <SplitModeSection
                modes={splitModes}
                split={split}
                members={contextMembers}
                totalAmountCents={totalAmountCents}
                expenseCurrency={expenseCurrency}
                convertedLabel={convertedLabel}
                itemsEditable={mode === 'edit'}
                exactRaw={exactRaw}
                setExactRaw={setExactRaw}
                itemRaw={itemRaw}
                setItemRaw={setItemRaw}
                fromMinorUnits={fromMinorUnits}
                toMinorUnits={toMinorUnits}
                sanitizeAmountInput={sanitizeAmountInput}
                description={description}
              />

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
            </>
          )}
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
                      onPress={() => handleCurrencySelect(item.code)}
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
