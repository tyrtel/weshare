import React from 'react';
import { View, FlatList, ActivityIndicator } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { z } from 'zod';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '../../../components/ui/ScreenWrapper';
import { TAB_BAR_HEIGHT } from '../../../components/ui/UniversalTabBar';
import { Text } from '../../../components/ui/Text';
import { SplitStatusBadge } from '../../../components/ui/SplitStatusBadge';
import { useAuditHistory } from '../hooks/useAuditHistory';
import { useColors } from '../../../theme/colors';
import { tokens } from '../../../theme/tokens';
import { formatCurrency } from '../../../core/utils/formatCurrency';
import type { SplitRequest } from '../../../core/models/SplitRequest';

const auditParamsSchema = z.object({
  tripId:     z.string().min(1),
  fromUserId: z.string().min(1),
  toUserId:   z.string().min(1),
  fromName:   z.string().default(''),
  toName:     z.string().default(''),
});

function paymentMethodLabel(req: SplitRequest): string {
  if (req.stripeSessionId) return 'Stripe';
  if (req.obPaymentId)     return 'SEPA Bank Transfer';
  const labels: Record<string, string> = {
    revolut: 'Revolut',
    venmo:   'Venmo',
    lydia:   'Lydia',
    paypal:  'PayPal',
    other:   'Other',
  };
  return labels[req.preferredWallet] ?? 'Other';
}

function referenceId(req: SplitRequest): string | null {
  return req.stripePaymentLinkId ?? req.stripeSessionId ?? req.obPaymentId ?? req.externalRefId;
}

interface AuditRequestRowProps {
  req: SplitRequest;
}

function AuditRequestRow({ req }: AuditRequestRowProps) {
  const colors = useColors();
  const amount = formatCurrency(req.amountCents, req.currency);
  const method = paymentMethodLabel(req);
  const date   = req.createdAt.toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
  const ref = referenceId(req);

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius:    tokens.radius.card,
        padding:         tokens.spacing.md,
        gap:             tokens.spacing.xs,
        ...tokens.shadow.sm,
      }}
      accessibilityLabel={`${amount} payment, status ${req.status}, via ${method} on ${date}`}
    >
      {/* Top row: amount + status badge */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="label" color={colors.text.primary}>{amount}</Text>
        <SplitStatusBadge status={req.status} />
      </View>

      {/* Middle row: method + date */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="caption" color={colors.text.secondary}>{method}</Text>
        <Text variant="caption" color={colors.text.tertiary}>{date}</Text>
      </View>

      {/* Reference (only when present) */}
      {ref && (
        <Text variant="caption" color={colors.text.tertiary} numberOfLines={1}>
          Ref: {ref}
        </Text>
      )}
    </View>
  );
}

export function AuditDetailScreen() {
  const raw    = useLocalSearchParams();
  const parsed = auditParamsSchema.safeParse(raw);
  const colors = useColors();

  if (!parsed.success) {
    return (
      <ScreenWrapper>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: tokens.spacing.lg }}>
          <Text variant="body" color={colors.error.default} style={{ textAlign: 'center' }}>
            Invalid navigation parameters.
          </Text>
        </View>
      </ScreenWrapper>
    );
  }

  return <AuditDetailScreenContent params={parsed.data} />;
}

type AuditParams = z.infer<typeof auditParamsSchema>;

function AuditDetailScreenContent({ params }: { params: AuditParams }) {
  const { tripId, fromUserId, toUserId, fromName, toName } = params;
  const colors = useColors();

  const { requests, loading, error } = useAuditHistory(tripId, fromUserId, toUserId);

  const fromLabel = fromName || fromUserId;
  const toLabel   = toName   || toUserId;
  const title     = `${fromLabel} → ${toLabel}`;

  return (
    <ScreenWrapper>
      <Stack.Screen options={{ title: 'Payment History', headerBackTitle: 'Back' }} />

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
          {loading ? '…' : `${requests.length} record${requests.length !== 1 ? 's' : ''}`}
        </Text>
      </View>

      {loading && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary.default} />
        </View>
      )}

      {error && !loading && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: tokens.spacing.lg }}>
          <Text variant="body" color={colors.error.default} style={{ textAlign: 'center' }}>
            Could not load payment history.
          </Text>
        </View>
      )}

      {!loading && !error && requests.length === 0 && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: tokens.spacing.xl }}>
          <Ionicons name="receipt-outline" size={40} color={colors.text.tertiary} />
          <Text variant="body" color={colors.text.secondary} style={{ textAlign: 'center', marginTop: tokens.spacing.md }}>
            No payment history yet.
          </Text>
          <Text variant="caption" color={colors.text.tertiary} style={{ textAlign: 'center', marginTop: tokens.spacing.xs }}>
            Records appear here once a payment request is created.
          </Text>
        </View>
      )}

      {!loading && !error && requests.length > 0 && (
        <FlatList
          data={requests}
          keyExtractor={item => item.id}
          renderItem={({ item }) => <AuditRequestRow req={item} />}
          contentContainerStyle={{
            paddingHorizontal: tokens.spacing.md,
            paddingBottom:     tokens.spacing.lg + TAB_BAR_HEIGHT,
            gap:               tokens.spacing.sm,
          }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </ScreenWrapper>
  );
}
