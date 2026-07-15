import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, FlatList, ActivityIndicator, Pressable } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { z } from 'zod';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '../../../components/ui/ScreenWrapper';
import { TAB_BAR_HEIGHT } from '../../../components/ui/UniversalTabBar';
import { Text } from '../../../components/ui/Text';
import { RecordPaymentSheet } from '../components/RecordPaymentSheet';
import { useLedgerHistory } from '../hooks/useLedgerHistory';
import { useGroupLedgerHistory } from '../../groups/hooks/useGroupLedgerHistory';
import { useColors } from '../../../theme/colors';
import { tokens } from '../../../theme/tokens';
import { formatCurrency } from '../../../core/utils/formatCurrency';
import type { LedgerEntry } from '../../../core/logic/settlement';

const auditParamsSchema = z.object({
  tripId:     z.string().min(1).optional(),
  groupId:    z.string().min(1).optional(),
  fromUserId: z.string().min(1),
  toUserId:   z.string().min(1),
  fromName:   z.string().default(''),
  toName:     z.string().default(''),
}).refine(p => Boolean(p.tripId) !== Boolean(p.groupId), {
  message: 'Exactly one of tripId or groupId must be provided',
});

interface LedgerEntryRowProps {
  entry: LedgerEntry;
  fromLabel: string;
  toLabel: string;
}

function LedgerEntryRow({ entry, fromLabel, toLabel }: LedgerEntryRowProps) {
  const { t } = useTranslation();
  const colors = useColors();

  const amountColor = entry.amountCents > 0
    ? colors.error.default
    : entry.amountCents < 0
      ? colors.success.default
      : colors.text.secondary;
  const sign = entry.amountCents > 0 ? '+' : entry.amountCents < 0 ? '−' : '';
  const description = entry.type === 'payment' ? t('settlement.audit.payment_description') : entry.description;
  const date = entry.date.toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
  const balanceLabel = entry.balanceCents === 0
    ? t('settlement.audit.balance_settled', { from: fromLabel, to: toLabel })
    : entry.balanceCents > 0
      ? t('settlement.audit.balance_owes', { from: fromLabel, to: toLabel, amount: formatCurrency(entry.balanceCents, entry.currency) })
      : t('settlement.audit.balance_owes', { from: toLabel, to: fromLabel, amount: formatCurrency(-entry.balanceCents, entry.currency) });

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius:    tokens.radius.card,
        padding:         tokens.spacing.md,
        gap:             tokens.spacing.xs,
        ...tokens.shadow.sm,
      }}
      accessibilityLabel={`${description}, ${formatCurrency(Math.abs(entry.amountCents), entry.currency)}, ${date}`}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.xs, flex: 1 }}>
          <Ionicons
            name={entry.type === 'expense' ? 'receipt-outline' : 'swap-horizontal-outline'}
            size={16}
            color={colors.text.secondary}
          />
          <Text variant="label" color={colors.text.primary} numberOfLines={1} style={{ flex: 1 }}>
            {description}
          </Text>
        </View>
        <Text variant="label" color={amountColor}>
          {sign}{formatCurrency(Math.abs(entry.amountCents), entry.currency)}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="caption" color={colors.text.tertiary}>{date}</Text>
        <Text variant="caption" color={colors.text.tertiary} numberOfLines={1}>{balanceLabel}</Text>
      </View>
    </View>
  );
}

export function AuditDetailScreen() {
  const { t } = useTranslation();
  const raw    = useLocalSearchParams();
  const parsed = auditParamsSchema.safeParse(raw);
  const colors = useColors();

  if (!parsed.success) {
    return (
      <ScreenWrapper>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: tokens.spacing.lg }}>
          <Text variant="body" color={colors.error.default} style={{ textAlign: 'center' }}>
            {t('common.error_invalid_params')}
          </Text>
        </View>
      </ScreenWrapper>
    );
  }

  return <AuditDetailScreenContent params={parsed.data} />;
}

type AuditParams = z.infer<typeof auditParamsSchema>;

// Scope-specific: each just calls its own hook and hands the ledger state to
// the one shared view below — this is the "reuse the same component, not a
// parallel one" the Phase 4d plan asks for.

function AuditDetailScreenContent({ params }: { params: AuditParams }) {
  const { fromUserId, toUserId, fromName, toName } = params;
  return params.tripId ? (
    <TripLedgerView tripId={params.tripId} fromUserId={fromUserId} toUserId={toUserId} fromName={fromName} toName={toName} />
  ) : (
    <GroupLedgerView groupId={params.groupId!} fromUserId={fromUserId} toUserId={toUserId} fromName={fromName} toName={toName} />
  );
}

interface ScopedLedgerViewProps {
  fromUserId: string;
  toUserId: string;
  fromName: string;
  toName: string;
}

function TripLedgerView({ tripId, fromUserId, toUserId, fromName, toName }: ScopedLedgerViewProps & { tripId: string }) {
  const ledger = useLedgerHistory(tripId, fromUserId, toUserId);
  return <LedgerView {...ledger} fromUserId={fromUserId} toUserId={toUserId} fromName={fromName} toName={toName} />;
}

function GroupLedgerView({ groupId, fromUserId, toUserId, fromName, toName }: ScopedLedgerViewProps & { groupId: string }) {
  const ledger = useGroupLedgerHistory(groupId, fromUserId, toUserId);
  return <LedgerView {...ledger} fromUserId={fromUserId} toUserId={toUserId} fromName={fromName} toName={toName} />;
}

interface LedgerViewProps extends ScopedLedgerViewProps {
  entries: LedgerEntry[];
  balanceCents: number;
  currency: string;
  loading: boolean;
  error: unknown;
  settling: boolean;
  recordPayment: (amountCents: number) => Promise<void>;
}

function LedgerView({
  fromUserId, toUserId, fromName, toName,
  entries, balanceCents, currency, loading, error, settling, recordPayment,
}: LedgerViewProps) {
  const { t } = useTranslation();
  const colors = useColors();
  const [recording, setRecording] = useState(false);

  const fromLabel = fromName || fromUserId;
  const toLabel   = toName   || toUserId;
  const title     = `${fromLabel} → ${toLabel}`;

  return (
    <ScreenWrapper>
      <Stack.Screen options={{ title: t('settlement.audit.title'), headerBackTitle: t('common.back') }} />

      {/* Pair header */}
      <View
        style={{
          margin:          tokens.spacing.md,
          padding:         tokens.spacing.md,
          backgroundColor: colors.surface,
          borderRadius:    tokens.radius.card,
          flexDirection:   'row',
          alignItems:      'center',
          gap:             tokens.spacing.sm,
          ...tokens.shadow.sm,
        }}
      >
        <Ionicons name="time-outline" size={18} color={colors.text.secondary} />
        <Text variant="label" color={colors.text.primary} numberOfLines={1} style={{ flex: 1 }}>
          {title}
        </Text>
        <Text variant="caption" color={colors.text.tertiary}>
          {loading ? '…' : t('settlement.audit.record_count', { count: entries.length })}
        </Text>
      </View>

      {loading && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary.default} />
        </View>
      )}

      {Boolean(error) && !loading && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: tokens.spacing.lg }}>
          <Text variant="body" color={colors.error.default} style={{ textAlign: 'center' }}>
            {t('settlement.audit.error_load')}
          </Text>
        </View>
      )}

      {!loading && !error && entries.length === 0 && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: tokens.spacing.xl }}>
          <Ionicons name="receipt-outline" size={40} color={colors.text.tertiary} />
          <Text variant="body" color={colors.text.secondary} style={{ textAlign: 'center', marginTop: tokens.spacing.md }}>
            {t('settlement.audit.empty_title')}
          </Text>
          <Text variant="caption" color={colors.text.tertiary} style={{ textAlign: 'center', marginTop: tokens.spacing.xs }}>
            {t('settlement.audit.empty_body', { from: fromLabel, to: toLabel })}
          </Text>
        </View>
      )}

      {!loading && !error && entries.length > 0 && (
        <FlatList
          data={entries}
          keyExtractor={item => item.id}
          renderItem={({ item }) => <LedgerEntryRow entry={item} fromLabel={fromLabel} toLabel={toLabel} />}
          contentContainerStyle={{
            paddingHorizontal: tokens.spacing.md,
            paddingBottom:     tokens.spacing.lg + TAB_BAR_HEIGHT + 64,
            gap:               tokens.spacing.sm,
          }}
          showsVerticalScrollIndicator={false}
        />
      )}

      {!loading && !error && (
        <Pressable
          testID="record-payment-button"
          onPress={() => setRecording(true)}
          style={({ pressed }) => ({
            position:        'absolute',
            bottom:          TAB_BAR_HEIGHT + tokens.spacing.md,
            left:            tokens.spacing.md,
            right:           tokens.spacing.md,
            flexDirection:   'row',
            alignItems:      'center',
            justifyContent:  'center',
            gap:             tokens.spacing.sm,
            paddingVertical: tokens.spacing.md,
            borderRadius:    tokens.radius.pill,
            backgroundColor: colors.primary.default,
            opacity:         pressed ? 0.85 : 1,
            ...tokens.shadow.lg,
          })}
        >
          <Ionicons name="add-circle-outline" size={18} color="#ffffff" />
          <Text variant="label" color="#ffffff">{t('settlement.audit.record_payment_button')}</Text>
        </Pressable>
      )}

      <RecordPaymentSheet
        visible={recording}
        fromLabel={fromLabel}
        toLabel={toLabel}
        defaultAmountCents={Math.max(balanceCents, 0)}
        currency={currency}
        busy={settling}
        onClose={() => setRecording(false)}
        onConfirm={(amountCents) => {
          void recordPayment(amountCents).then(() => setRecording(false));
        }}
      />
    </ScreenWrapper>
  );
}
