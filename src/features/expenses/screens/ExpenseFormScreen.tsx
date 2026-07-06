import React, { useState, useMemo } from 'react';
import {
  View, ScrollView, Pressable, TextInput, KeyboardAvoidingView,
  Platform, ActivityIndicator, StyleSheet,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ScreenWrapper } from '../../../components/ui/ScreenWrapper';
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
import { useEditExpense } from '../hooks/useEditExpense';
import { useExpenseDetail } from '../hooks/useExpenseDetail';
import { useSplitForm } from '../hooks/useSplitForm';
import type { SplitFormEntry } from '../hooks/useSplitForm';
import { useCurrencyRate } from '../hooks/useCurrencyRate';
import { useCreateGroupExpense } from '../../groups/hooks/useCreateGroupExpense';
import { MakeRecurringSheet } from '../../groups/components/MakeRecurringSheet';
import { useTripDetail } from '../../trips/hooks/useTripDetail';
import { useTripSessionStore, useService } from '../../../core/di/ServiceContext';
import { AUTH } from '../../../core/di/tokens';
import { useColors } from '../../../theme/colors';
import { tokens } from '../../../theme/tokens';
import { CURRENCIES, currencyLabel, currencySymbol } from '../../../core/constants/currencies';
import { formatCurrency } from '../../../core/utils/formatCurrency';
import type { Expense } from '../../../core/models/Expense';
import type { ParsedReceiptLineItem } from '../../../core/models/ParsedReceipt';
import type { SplitResult } from '../utils/splitCalculations';
import type { TripMember } from '../../../core/models/TripMember';
import type { GroupMember } from '../../../core/models/GroupMember';
import { useTranslation } from 'react-i18next';
import { useActiveTheme } from '../../../core/ThemeContext';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ledgerColors } from '../../../theme/colors';
import { ledgerRadius, ledgerShadow, ledgerFonts } from '../../../theme/tokens';
import { Segmented } from '../../../components/ui/Segmented';

// ── Constants ─────────────────────────────────────────────────────────────────

const SPLIT_MODES: { key: SplitMode; label: string }[] = [
  { key: 'equal',        label: 'expenses.form.split_equal' },
  { key: 'proportional', label: 'expenses.form.split_proportional' },
  { key: 'custom',       label: 'expenses.form.split_custom' },
  { key: 'itemized',     label: 'expenses.form.split_itemized' },
];

const EMPTY_EXPENSES: never[] = [];

// ── Helpers ───────────────────────────────────────────────────────────────────

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
  const colors  = useColors();
  const auth    = useService(AUTH);

  const isGroupMode    = !!groupId && !tripId && !expenseId;
  const isRecurring    = isGroupMode && recurring === 'true';
  const mode           = expenseId ? 'edit' : 'add';

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

  const { addExpense,         loading: addLoading,   error: addError   } = useAddExpense(resolvedTripId);
  const { createGroupExpense, loading: groupLoading, error: groupError  } = useCreateGroupExpense(groupId ?? '');
  const { editExpense,        loading: editLoading,  error: editError   } = useEditExpense();

  const saving = isGroupMode ? groupLoading : mode === 'add' ? addLoading  : editLoading;
  const error  = isGroupMode ? groupError   : mode === 'add' ? addError    : editError;

  // ── Unified members + currency ────────────────────────────────────────────────

  const contextMembers: TripMember[] = isGroupMode
    ? groupMembersAsTripMembers(group?.members ?? [])
    : trip?.members ?? [];

  const contextCurrency = isGroupMode ? (group?.currency ?? 'EUR') : (trip?.currency ?? 'EUR');

  // ── Form state ────────────────────────────────────────────────────────────────

  const [description,         setDescription]         = useState('');
  const [totalAmountCents,    setTotalAmountCents]     = useState(0);
  const [category,            setCategory]            = useState<string | undefined>(undefined);
  const [paidByUserId,        setPaidByUserId]         = useState('');
  const [entryCurrency,       setEntryCurrency]       = useState('');
  const [currencyDropVisible, setCurrencyDropVisible] = useState(false);
  const [initialised,         setInitialised]         = useState(false);
  const [dirty,               setDirty]               = useState(false);
  const [receiptPath,         setReceiptPath]         = useState<string | undefined>(undefined);
  const [splitExpanded,       setSplitExpanded]       = useState(mode === 'edit');
  const [rawAmount,           setRawAmount]           = useState('');

  // Render-phase initialisation — fires once when the necessary data arrives.
  if (!initialised) {
    if (isGroupMode && group) {
      if (group.members.length > 0) setPaidByUserId(group.members[0].userId);
      setEntryCurrency(group.currency);
      setInitialised(true);
    } else if (mode === 'add' && trip) {
      if (trip.members.length > 0) setPaidByUserId(trip.members[0].userId);
      const lastForeign = [...tripExpenses]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .find(e => e.metadata?.originalAmount)
        ?.metadata?.originalAmount?.currency ?? null;
      setEntryCurrency(lastForeign ?? trip.currency);
      setInitialised(true);
    } else if (mode === 'edit' && expense && trip) {
      setDescription(expense.description);
      setTotalAmountCents(expense.metadata.originalAmount?.amountCents ?? expense.totalAmountCents);
      setEntryCurrency(expense.metadata.originalAmount?.currency ?? trip.currency);
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
    return Math.round(totalAmountCents * rate.result.rate);
  }, [isForeign, totalAmountCents, rate.result]);

  // Pre-fill splits from existing expense when in edit mode.
  const initialEntries: SplitFormEntry[] | undefined = useMemo(() => {
    if (mode !== 'edit' || !expense || !trip) return undefined;
    return trip.members.map(m => {
      const s = expense.splits.find(sp => sp.userId === m.userId);
      return { userId: m.userId, included: !!s, customAmountCents: s ? s.amountOwedCents : null };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, expense?.id, trip?.id]);

  const split = useSplitForm({
    members:          contextMembers,
    totalAmountCents: convertedCents,
    initialEntries,
    initialMode:      mode === 'edit' ? 'custom' : undefined,
    ready:            mode === 'edit' ? (!!expense && !!trip) : undefined,
  });

  const isItemized        = split.splitMode === 'itemized';
  const showSplitToggle   = splitExpanded || split.splitMode !== 'equal';
  const enteredTotal   = isItemized ? split.itemizedTotal : totalAmountCents;
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
    if (parsedLineItems.length > 0 && contextMembers.length > 0) {
      split.initFromParsed(parsedLineItems, contextMembers);
    } else if (amountCents > 0) {
      setTotalAmountCents(amountCents);
    }
  };

  const handleSubmit = async () => {
    const rawSplits   = split.computedSplits;
    const finalSplits = isForeign && rate.result
      ? scaleAndCorrect(rawSplits, rate.result.rate, effectiveTotal)
      : rawSplits;

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
      lineItems:        isItemized ? split.lineItems : undefined,
      originalAmount,
    };

    let saved = null;
    if (isGroupMode) {
      saved = await createGroupExpense(input);
      if (saved && isRecurring) {
        setSavedForRecurring(saved);
        setRecurringSheetOpen(true);
        return;
      }
    } else if (mode === 'add') {
      saved = await addExpense(input);
    } else if (expense) {
      saved = await editExpense(expense, input);
    }

    if (saved) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)');
    }
  };

  // ── Styles ───────────────────────────────────────────────────────────────────

  const inputBorder = {
    backgroundColor: colors.surface,
    borderColor:     colors.border,
    borderWidth:     1,
    borderRadius:    tokens.radius.md,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical:   tokens.spacing.sm,
    color:           colors.text.primary,
    fontSize:        tokens.fontSize.md,
  } as const;

  // ── Theme ─────────────────────────────────────────────────────────────────────

  const activeTheme = useActiveTheme();
  const isLedger = activeTheme === 'ledger';
  const expenseCurrency = entryCurrency || contextCurrency;

  // ── Loading state ────────────────────────────────────────────────────────────

  const isLoading = isGroupMode
    ? !group
    : tripLoading || (mode === 'edit' && expLoading) || !trip || (mode === 'edit' && !expense);

  const title = isGroupMode
    ? t('groups.expense.add_title')
    : mode === 'add' ? t('expenses.form.add_title') : t('expenses.form.edit_title');

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

  // ── Ledger layout ─────────────────────────────────────────────────────────────

  if (isLedger) {
    return (
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: ledgerColors.background }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView edges={['top']} style={{ backgroundColor: ledgerColors.background }}>
          <View style={addStyles.titleRow}>
            <Pressable onPress={() => router.back()} hitSlop={10}>
              <Feather name="x" size={24} color={ledgerColors.text.primary} />
            </Pressable>
            <Text style={addStyles.screenTitle}>Expense</Text>
            <View style={{ width: 24 }} />
          </View>
        </SafeAreaView>

        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: 80 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Amount + title card */}
          <View style={addStyles.card}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 4 }}>
              <Text style={addStyles.currency}>{currencySymbol(expenseCurrency)}</Text>
              <TextInput
                style={addStyles.amountInput}
                value={rawAmount}
                onChangeText={v => {
                  setRawAmount(v);
                  setTotalAmountCents(Math.round((parseFloat(v) || 0) * 100));
                }}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={ledgerColors.text.tertiary}
              />
            </View>
            <TextInput
              style={addStyles.titleInput}
              value={description}
              onChangeText={setDescription}
              placeholder="What was it for?"
              placeholderTextColor={ledgerColors.text.tertiary}
            />
          </View>

          {/* Paid by */}
          <Text style={addStyles.fieldLabel}>Paid by</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {contextMembers.map(m => {
              const active = paidByUserId === m.userId;
              return (
                <Pressable
                  key={m.userId}
                  onPress={() => setPaidByUserId(m.userId)}
                  style={[addStyles.payerChip, active && addStyles.payerChipActive]}
                >
                  <View style={{
                    width: 22, height: 22, borderRadius: 11,
                    backgroundColor: active ? 'rgba(255,255,255,0.3)' : ledgerColors.primary.subtle,
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#fff' : ledgerColors.primary.default }}>
                      {m.displayName.trim().charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={[addStyles.payerName, active && { color: '#fff' }]}>
                    {m.displayName.split(' ')[0]}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Split mode segmented control */}
          <Text style={addStyles.fieldLabel}>Split</Text>
          <Segmented
            value={split.splitMode}
            onChange={k => split.handleSetMode(k as SplitMode)}
            options={[
              { key: 'equal',        label: 'Evenly' },
              { key: 'proportional', label: 'Shares' },
              { key: 'custom',       label: 'Exact' },
              { key: 'itemized',     label: 'Items' },
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
                        {entry.included && <Feather name="check" size={13} color="#fff" />}
                      </View>
                      <View style={{
                        width: 30, height: 30, borderRadius: 15,
                        backgroundColor: ledgerColors.primary.subtle,
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: ledgerColors.primary.default }}>
                          {member.displayName.trim().charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <Text style={addStyles.splitName}>{member.displayName}</Text>
                      <Text style={[addStyles.splitAmount, { color: entry.included ? ledgerColors.text.primary : ledgerColors.text.tertiary }]}>
                        {formatCurrency(share, expenseCurrency)}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          )}

          {/* Proportional (shares) mode */}
          {split.splitMode === 'proportional' && (
            <View style={addStyles.card}>
              {split.splitEntries.map((entry, i) => {
                const member = contextMembers.find(m => m.userId === entry.userId);
                if (!member) return null;
                const w = split.weights[entry.userId] ?? 1;
                const includedEntries = split.splitEntries.filter(e => e.included);
                const totalWeights = includedEntries.reduce((s, e) => s + (split.weights[e.userId] ?? 1), 0) || 1;
                const share = entry.included ? Math.round(totalAmountCents * w / totalWeights) : 0;
                return (
                  <View key={entry.userId}>
                    {i > 0 && <View style={addStyles.rowDivider} />}
                    <View style={addStyles.splitRow}>
                      <View style={{
                        width: 30, height: 30, borderRadius: 15,
                        backgroundColor: ledgerColors.primary.subtle,
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: ledgerColors.primary.default }}>
                          {member.displayName.trim().charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={addStyles.splitName}>{member.displayName}</Text>
                        <Text style={{ fontSize: 12, color: ledgerColors.text.secondary, marginTop: 1 }}>
                          {w} share{w === 1 ? '' : 's'} · {Math.round(100 * w / totalWeights)}%
                        </Text>
                      </View>
                      <Text style={addStyles.splitAmount}>{formatCurrency(share, expenseCurrency)}</Text>
                      <View style={addStyles.stepper}>
                        <Pressable style={addStyles.stepBtn} onPress={() => split.handleChangeWeight(entry.userId, Math.max(0, w - 1))}>
                          <Feather name="minus" size={15} color={ledgerColors.text.primary} />
                        </Pressable>
                        <Text style={addStyles.stepVal}>{w}</Text>
                        <Pressable style={addStyles.stepBtn} onPress={() => split.handleChangeWeight(entry.userId, w + 1)}>
                          <Feather name="plus" size={15} color={ledgerColors.text.primary} />
                        </Pressable>
                      </View>
                    </View>
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
                const displayVal = entry.customAmountCents != null && entry.customAmountCents > 0
                  ? (entry.customAmountCents / 100).toFixed(2) : '';
                return (
                  <View key={entry.userId}>
                    {i > 0 && <View style={addStyles.rowDivider} />}
                    <View style={addStyles.splitRow}>
                      <View style={{
                        width: 30, height: 30, borderRadius: 15,
                        backgroundColor: ledgerColors.primary.subtle,
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: ledgerColors.primary.default }}>
                          {member.displayName.trim().charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <Text style={[addStyles.splitName, { flex: 1 }]}>{member.displayName}</Text>
                      <View style={addStyles.exactBox}>
                        <Text style={{ fontSize: 14, color: ledgerColors.text.secondary }}>
                          {currencySymbol(expenseCurrency)}
                        </Text>
                        <TextInput
                          style={addStyles.exactInput}
                          keyboardType="decimal-pad"
                          placeholder="0.00"
                          placeholderTextColor={ledgerColors.text.tertiary}
                          value={displayVal}
                          onChangeText={v => split.handleChangeAmount(entry.userId, Math.round((parseFloat(v) || 0) * 100))}
                        />
                      </View>
                    </View>
                  </View>
                );
              })}
              <View style={{ height: 1, backgroundColor: ledgerColors.border, marginVertical: 8 }} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 13, fontWeight: '500', color: ledgerColors.text.secondary }}>
                  {split.remainder === 0 ? 'Fully assigned' : 'Left to assign'}
                </Text>
                <Text style={[addStyles.splitAmount, {
                  color: split.remainder === 0 ? ledgerColors.success.default : ledgerColors.error.default,
                }]}>
                  {formatCurrency(Math.abs(split.remainder), expenseCurrency)}
                </Text>
              </View>
            </View>
          )}

          {/* Itemized mode */}
          {split.splitMode === 'itemized' && (
            <View style={[addStyles.card, { padding: 20 }]}>
              <Text style={[addStyles.fieldLabel, { textAlign: 'center', marginTop: 0, marginBottom: 4 }]}>
                {description.toUpperCase() || 'RECEIPT'}
              </Text>
              <Text style={{ fontSize: 11.5, color: ledgerColors.text.tertiary, textAlign: 'center', marginBottom: 8 }}>
                tap a member to assign them to each item
              </Text>
              <View style={{ borderBottomWidth: 1, borderStyle: 'dashed', borderColor: ledgerColors.borderMuted, marginBottom: 12 }} />
              {split.lineItems.map(item => (
                <View key={item.id} style={{ marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                    <Text style={{ fontSize: 14, fontWeight: '500', color: ledgerColors.text.primary, flexShrink: 1 }} numberOfLines={1}>
                      {item.description}
                    </Text>
                    <View style={{ flex: 1, borderBottomWidth: 1, borderStyle: 'dotted', borderColor: ledgerColors.borderMuted }} />
                    <Text style={{ fontSize: 14, color: ledgerColors.text.primary }}>
                      {formatCurrency(item.amountCents, expenseCurrency)}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                    {contextMembers.map(m => {
                      const on = item.assignedUserIds.includes(m.userId);
                      return (
                        <Pressable
                          key={m.userId}
                          onPress={() => split.toggleMemberInItem(item.id, m.userId)}
                          style={{
                            width: 28, height: 28, borderRadius: 14,
                            borderWidth: 1.5,
                            borderColor: on ? ledgerColors.primary.default : ledgerColors.borderMuted,
                            backgroundColor: on ? ledgerColors.primary.subtle : ledgerColors.background,
                            alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '600', color: on ? ledgerColors.primary.default : ledgerColors.text.secondary }}>
                            {m.displayName.trim().charAt(0).toUpperCase()}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))}
              <Pressable
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 }}
                onPress={split.addLineItem}
              >
                <Feather name="plus" size={14} color={ledgerColors.primary.default} />
                <Text style={{ fontSize: 13, fontWeight: '600', color: ledgerColors.primary.default }}>Add item</Text>
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
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Feather name="check" size={18} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '600', fontSize: 16 }}>Save expense</Text>
              </>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  const rateSourceColor = rate.result?.source === 'live'
    ? colors.text.secondary
    : colors.warning?.default ?? colors.text.secondary;

  const confirmButton = () => (
    <Pressable
      onPress={handleSubmit}
      disabled={!isValid || saving}
      accessibilityRole="button"
      accessibilityLabel={mode === 'add' || isGroupMode ? t('expenses.form.confirm_label') : t('expenses.form.save_label')}
      style={({ pressed }) => ({
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: isValid && !saving ? colors.primary.default : colors.text.tertiary,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: tokens.spacing.xs,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      {saving
        ? <ActivityIndicator color="#fff" size="small" />
        : <Ionicons name="checkmark" size={20} color="#fff" />}
    </Pressable>
  );

  // ── Form body (shared between trip and group) ─────────────────────────────────

  const formBody = (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={{ padding: tokens.spacing.md, paddingBottom: tokens.spacing.xxl }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Heading + receipt capture */}
        <Text variant="heading2" style={{ marginBottom: tokens.spacing.sm }}>{title}</Text>
        <ReceiptCapture onParsed={handleParsed} disabled={saving} style={{ marginBottom: tokens.spacing.md }} />

        {/* Description */}
        <Text variant="label" color={colors.text.secondary} style={{ marginBottom: tokens.spacing.xs }}>
          {t('expenses.form.description_label')}
        </Text>
        <TextInput
          value={description}
          onChangeText={v => { setDirty(true); setDescription(v); }}
          placeholder={t('expenses.form.description_placeholder')}
          placeholderTextColor={colors.text.tertiary}
          style={[inputBorder, { marginBottom: tokens.spacing.md }]}
          autoFocus={mode === 'add' || isGroupMode}
          returnKeyType="next"
          accessibilityLabel={t('expenses.form.description_accessibility')}
        />

        {/* Category */}
        <CategorySelector value={category} onChange={setCategory} />

        {/* Amount + currency — hidden in itemized mode */}
        {!isItemized && (
          <View style={{ marginBottom: tokens.spacing.sm }}>
            <AmountInput
              amountCents={totalAmountCents}
              onChangeCents={v => { setDirty(true); setTotalAmountCents(v); }}
              currency={entryCurrency || contextCurrency}
              label={t('expenses.form.amount_label')}
              onCurrencyPress={() => setCurrencyDropVisible(true)}
              isForeign={isForeign}
            />
            {dirty && totalAmountCents === 0 && (
              <Text variant="caption" color={colors.text.secondary} style={{ marginTop: tokens.spacing.xs }}>
                {t('expenses.form.amount_hint')}
              </Text>
            )}
          </View>
        )}

        {/* Exchange rate indicator */}
        {!isItemized && isForeign && (
          <View style={{ marginBottom: tokens.spacing.md }}>
            {rate.loading ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.xs }}>
                <ActivityIndicator size="small" color={colors.text.secondary} />
                <Text variant="caption" color={colors.text.secondary}>{t('expenses.form.rate_fetching')}</Text>
              </View>
            ) : rate.error ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.xs }}>
                <Ionicons name="warning-outline" size={14} color={rateSourceColor} />
                <Text variant="caption" color={rateSourceColor}>{t('expenses.form.rate_unavailable')}</Text>
                <Pressable onPress={rate.refresh} hitSlop={8}>
                  <Text variant="caption" color={colors.primary.default}>{' '}{t('common.retry')}</Text>
                </Pressable>
              </View>
            ) : rate.result ? (
              <Text variant="caption" color={rateSourceColor}>
                {`at ${rate.result.source !== 'live' ? '≈' : ''}${currencySymbol(entryCurrency)}${formatRate(rate.result.rate)}${convertedCents > 0 ? ` = ${formatCurrency(convertedCents, contextCurrency)}` : ''}${rate.result.source === 'approximate' ? ' · approx.' : ''}`}
              </Text>
            ) : null}
          </View>
        )}

        <Divider style={{ marginBottom: tokens.spacing.md }} />

        {/* Paid by */}
        <Text variant="label" color={colors.text.secondary} style={{ marginBottom: tokens.spacing.sm }}>
          {t('expenses.form.paid_by_label')}
        </Text>
        <PayerSelector
          members={contextMembers}
          selectedUserId={paidByUserId}
          onSelect={setPaidByUserId}
        />

        <Divider style={{ marginVertical: tokens.spacing.md }} />

        {/* Split — collapsed summary or expanded mode toggle */}
        {showSplitToggle ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: tokens.spacing.sm }}>
            <Text variant="label" color={colors.text.secondary}>{t('expenses.form.split_between_label')}</Text>
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
                      paddingVertical:   tokens.spacing.xs,
                      borderRadius:      tokens.radius.pill,
                      borderWidth:       1,
                      borderColor:       active ? colors.primary.default : colors.border,
                      backgroundColor:   active ? colors.primary.subtle : 'transparent',
                    }}
                  >
                    <Text variant="caption" color={active ? colors.primary.default : colors.text.secondary}>
                      {t(label)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: tokens.spacing.sm }}>
            <Text variant="label" color={colors.text.secondary}>{t('expenses.form.split_equal_default_label')}</Text>
            <Pressable
              onPress={() => setSplitExpanded(true)}
              accessibilityRole="button"
              hitSlop={8}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <Text variant="caption" color={colors.primary.default}>{t('expenses.form.split_customize')}</Text>
            </Pressable>
          </View>
        )}

        {/* ── Itemized mode ── */}
        {isItemized ? (
          <>
            {split.lineItems.map(item => (
              <LineItemRow
                key={item.id}
                item={item}
                members={contextMembers}
                currency={entryCurrency || contextCurrency}
                onUpdateDescription={desc => split.updateLineItem(item.id, { description: desc })}
                onUpdateAmount={cents => split.updateLineItem(item.id, { amountCents: cents })}
                onToggleMember={userId => split.toggleMemberInItem(item.id, userId)}
                onRemove={() => split.removeLineItem(item.id)}
              />
            ))}
            <Pressable
              onPress={split.addLineItem}
              accessibilityRole="button"
              accessibilityLabel={t('expenses.form.add_line_item_label')}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: tokens.spacing.xs,
                paddingVertical: tokens.spacing.sm,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Ionicons name="add-circle-outline" size={18} color={colors.primary.default} />
              <Text variant="label" color={colors.primary.default}>{t('expenses.form.add_line_item')}</Text>
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
                <Text variant="label" color={colors.text.secondary}>{t('expenses.form.itemized_total_label')}</Text>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text variant="label" color={colors.text.primary}>
                    {formatCurrency(split.itemizedTotal, entryCurrency || contextCurrency)}
                  </Text>
                  {isForeign && rate.result && split.itemizedTotal > 0 && (
                    <Text variant="caption" color={colors.text.secondary}>
                      = {formatCurrency(effectiveTotal, contextCurrency)}
                    </Text>
                  )}
                </View>
              </View>
            )}
          </>
        ) : (
          /* ── Equal / proportional / custom modes ── */
          <>
            {contextMembers.map((member, i) => {
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
                  currency={contextCurrency}
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
                    ? t('expenses.form.remainder_to_assign', { amount: formatCurrency(split.remainder, contextCurrency) })
                    : t('expenses.form.remainder_over', { amount: formatCurrency(Math.abs(split.remainder), contextCurrency) })}
                </Text>
              </View>
            )}
          </>
        )}

        <ErrorBanner error={error} fallback={t('expenses.form.error_save')} style={{ marginTop: tokens.spacing.sm }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <ScreenWrapper>
      <Stack.Screen options={{ title, headerRight: confirmButton }} />

      {/* Groups have no open/closed concept — skip the guard */}
      {isGroupMode ? formBody : (
        <ClosedTripGuard
          trip={trip!}
          message={mode === 'add' ? t('expenses.form.closed_add_guard') : t('expenses.form.closed_edit_guard')}
        >
          {formBody}
        </ClosedTripGuard>
      )}

      {/* Recurring setup sheet — shown after expense creation when launched from recurring FAB */}
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

      {/* Currency dropdown overlay */}
      {currencyDropVisible && (
        <Pressable
          style={[styles.backdrop, { padding: tokens.spacing.xl }]}
          onPress={() => setCurrencyDropVisible(false)}
          accessibilityLabel={t('trips.form.currency_close_label')}
          accessibilityRole="button"
        >
          <View style={[styles.sheet, { backgroundColor: colors.surface, borderRadius: tokens.radius.card }]}>
            <View style={{ paddingHorizontal: tokens.spacing.md, paddingVertical: tokens.spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text variant="label" color={colors.text.secondary}>{t('expenses.form.entry_currency_label')}</Text>
            </View>
            {CURRENCIES.map((item, index) => {
              const selected     = item.code === (entryCurrency || contextCurrency);
              const isContextCcy = item.code === contextCurrency;
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
                      paddingVertical:   tokens.spacing.md,
                      backgroundColor:   pressed ? colors.surfaceAlt : selected ? colors.primary.subtle : 'transparent',
                    })}
                  >
                    <View>
                      <Text variant="body" color={selected ? colors.primary.default : colors.text.primary}>
                        {currencyLabel(item.code)}
                      </Text>
                      {isContextCcy && (
                        <Text variant="caption" color={colors.text.tertiary}>
                          {isGroupMode ? t('expenses.form.group_currency_label') : t('trips.form.trip_currency_label')}
                        </Text>
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

const addStyles = StyleSheet.create({
  titleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12,
  },
  screenTitle: { fontFamily: ledgerFonts.display, fontSize: 19, color: ledgerColors.text.primary },
  card: {
    backgroundColor: ledgerColors.surface,
    borderRadius: ledgerRadius.card,
    padding: 16,
    ...ledgerShadow.card,
  },
  currency: { fontFamily: ledgerFonts.displaySemibold, fontSize: 26, color: ledgerColors.text.secondary },
  amountInput: {
    fontFamily: ledgerFonts.display,
    fontSize: 44, color: ledgerColors.text.primary,
    minWidth: 140, textAlign: 'center',
  },
  titleInput: {
    fontSize: 15, color: ledgerColors.text.primary, textAlign: 'center',
    borderTopWidth: 1, borderColor: ledgerColors.border,
    paddingTop: 12, marginTop: 8,
  },
  fieldLabel: {
    fontSize: 12, fontWeight: '600', color: ledgerColors.text.secondary,
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginTop: 20, marginBottom: 8,
  },
  payerChip: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: ledgerColors.surface, borderWidth: 1, borderColor: ledgerColors.borderMuted,
    borderRadius: ledgerRadius.pill, paddingVertical: 6, paddingLeft: 6, paddingRight: 13,
    ...ledgerShadow.card,
  },
  payerChipActive: { backgroundColor: ledgerColors.primary.default, borderColor: ledgerColors.primary.default },
  payerName: { fontSize: 13.5, fontWeight: '500', color: ledgerColors.text.primary },
  splitRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowDivider: { height: 1, backgroundColor: ledgerColors.border },
  splitName: { fontSize: 14.5, fontWeight: '500', color: ledgerColors.text.primary, flex: 1 },
  splitAmount: { fontFamily: ledgerFonts.displaySemibold, fontSize: 14, color: ledgerColors.text.primary, fontVariant: ['tabular-nums'] },
  check: {
    width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: ledgerColors.borderMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  checkOn: { backgroundColor: ledgerColors.primary.default, borderColor: ledgerColors.primary.default },
  stepper: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: ledgerColors.background, borderRadius: ledgerRadius.pill, marginLeft: 8,
  },
  stepBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  stepVal: { fontSize: 14, fontWeight: '600', color: ledgerColors.text.primary, width: 20, textAlign: 'center' },
  exactBox: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: ledgerColors.background, borderRadius: ledgerRadius.sm, paddingHorizontal: 10, height: 38,
  },
  exactInput: { fontSize: 15, fontWeight: '500', color: ledgerColors.text.primary, minWidth: 62, textAlign: 'right' },
  saveBtn: {
    flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 15, borderRadius: ledgerRadius.md,
    backgroundColor: ledgerColors.primary.default,
  },
});
