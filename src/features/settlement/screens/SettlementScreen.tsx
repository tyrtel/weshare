import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, FlatList, AppState, AppStateStatus, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { z } from 'zod';
import { ScreenWrapper } from '../../../components/ui/ScreenWrapper';
import { TAB_BAR_HEIGHT } from '../../../components/ui/UniversalTabBar';
import { SettlementSkeleton } from '../../../components/skeletons/SettlementSkeleton';
import { Text } from '../../../components/ui/Text';
import { SettlementRow } from '../components/SettlementRow';
import { PaymentMethodSheet } from '../components/PaymentMethodSheet';
import { useSettlement } from '../hooks/useSettlement';
import { useService } from '../../../core/di/ServiceContext';
import { TRIP_STORE } from '../../../core/di/tokens';
import { useColors } from '../../../theme/colors';
import { tokens } from '../../../theme/tokens';
import type { EnrichedSettlement } from '../hooks/useSettlement';
import type { SplitRequest } from '../../../core/models/SplitRequest';

const settlementParamsSchema = z.object({
  tripId: z.string().min(1),
});

import { confirm } from '../../../core/utils/confirm';
import { formatCurrency } from '../../../core/utils/formatCurrency';

export function SettlementScreen() {
  const raw    = useLocalSearchParams();
  const parsed = settlementParamsSchema.safeParse(raw);
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

  return <SettlementScreenContent tripId={parsed.data.tripId} />;
}

function SettlementScreenContent({ tripId }: { tripId: string }) {
  const colors   = useColors();
  const router   = useRouter();
  const storeApi = useService(TRIP_STORE);
  const {
    settlements,
    members,
    splitRequests,
    loading,
    error,
    currentUserId,
    tripStatus,
    allSettled,
    updateRequestStatus,
    closeTrip,
    markDebtPaid,
    markDebtOwed,
    refetch,
  } = useSettlement(tripId);

  const hasRollableDebts = settlements.some(s => {
    const status = s.latestRequest?.status ?? null;
    return status === null || status === 'owed' || status === 'created';
  });

  useFocusEffect(useCallback(() => { void refetch(); }, [refetch]));

  const handleCloseTrip = useCallback(() => {
    void closeTrip().then(() => router.back());
  }, [closeTrip, router]);

  const [payTarget, setPayTarget]           = useState<EnrichedSettlement | null>(null);
  const pendingRequestRef                   = useRef<SplitRequest | null>(null);
  const appStateRef                         = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      const wasBackground = appStateRef.current.match(/inactive|background/);
      appStateRef.current = nextState;

      if (wasBackground && nextState === 'active' && pendingRequestRef.current) {
        const req = pendingRequestRef.current;
        pendingRequestRef.current = null;

        void confirm(
          'Did you complete the payment?',
          `Did you send ${formatCurrency(req.amountCents, req.currency)} via ${req.preferredWallet}?`,
          'Yes, I paid',
          'default',
        ).then(confirmed => {
          if (confirmed) void updateRequestStatus(req, 'pending');
        });
      }
    });

    return () => sub.remove();
  }, [updateRequestStatus]);

  const currency       = settlements[0]?.currency ?? 'EUR';
  const youOweTotal    = settlements
    .filter(s => s.fromUserId === currentUserId)
    .reduce((sum, s) => sum + s.amountCents, 0);
  const owedToYouTotal = settlements
    .filter(s => s.toUserId === currentUserId)
    .reduce((sum, s) => sum + s.amountCents, 0);

  if (loading) {
    return <ScreenWrapper isLoading skeleton={<SettlementSkeleton />} />;
  }

  if (error) {
    return (
      <ScreenWrapper>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: tokens.spacing.lg }}>
          <Text variant="body" color={colors.error.default} style={{ textAlign: 'center' }}>
            Could not load settlement data.
          </Text>
        </View>
      </ScreenWrapper>
    );
  }

  const bottomPad = TAB_BAR_HEIGHT + tokens.spacing.xxl;

  return (
    <ScreenWrapper>
      <Stack.Screen options={{ title: 'Settle Up' }} />

      {/* Balance summary card */}
      {currentUserId && (
        <View
          style={{
            margin:          tokens.spacing.md,
            padding:         tokens.spacing.md,
            backgroundColor: colors.surface,
            borderRadius:    tokens.radius.card,
            ...tokens.shadow.sm,
          }}
        >
          {youOweTotal > 0 ? (
            <>
              <Text variant="label" color={colors.text.secondary}>You owe</Text>
              <Text variant="heading2" color={colors.error.default}>
                {formatCurrency(youOweTotal, currency)}
              </Text>
            </>
          ) : owedToYouTotal > 0 ? (
            <>
              <Text variant="label" color={colors.text.secondary}>You are owed</Text>
              <Text variant="heading2" color={colors.success.default}>
                {formatCurrency(owedToYouTotal, currency)}
              </Text>
            </>
          ) : (
            <>
              <Text variant="label" color={colors.text.secondary}>Your balance</Text>
              <Text variant="heading2" color={colors.success.default}>All settled up</Text>
            </>
          )}
        </View>
      )}

      {/* Settlement list */}
      {settlements.length === 0 ? (
        <View
          style={{
            flex:           1,
            alignItems:     'center',
            justifyContent: 'center',
            padding:        tokens.spacing.xl,
            paddingBottom:  bottomPad,
          }}
        >
          <Text variant="body" color={colors.text.secondary} style={{ textAlign: 'center' }}>
            Everyone is settled up.
          </Text>
        </View>
      ) : (
        <FlatList
          data={settlements}
          keyExtractor={item => `${item.fromUserId}-${item.toUserId}`}
          renderItem={({ item, index }) => (
            <SettlementRow
              settlement={item}
              members={members}
              isCurrentUserDebtor={item.fromUserId === currentUserId}
              index={index}
              onPay={
                item.fromUserId === currentUserId
                  ? () => {
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      setPayTarget(item);
                    }
                  : undefined
              }
              onMarkPaid={() => void markDebtPaid(item.fromUserId, item.toUserId)}
              onMarkOwed={() => void markDebtOwed(item.fromUserId, item.toUserId)}
              onHistory={() =>
                router.push({
                  pathname: `/settle/audit/${tripId}` as never,
                  params: {
                    fromUserId: item.fromUserId,
                    toUserId:   item.toUserId,
                    fromName:   item.fromDisplayName,
                    toName:     item.toDisplayName,
                  },
                })
              }
              showDivider={index < settlements.length - 1}
            />
          )}
          contentContainerStyle={{
            paddingHorizontal: tokens.spacing.md,
            paddingBottom:     bottomPad,
          }}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Payment method bottom sheet */}
      {payTarget && currentUserId && (
        <PaymentMethodSheet
          visible
          tripId={tripId}
          payerUserId={currentUserId}
          requesterUserId={payTarget.toUserId}
          amountCents={payTarget.amountCents}
          currency={payTarget.currency}
          recipientName={payTarget.toDisplayName}
          onClose={() => setPayTarget(null)}
          onPaymentLaunched={(req) => {
            storeApi.getState().appendSplitRequest(req);
            pendingRequestRef.current = req;
            setPayTarget(null);
          }}
        />
      )}

      {/* All settled — persistent close bar */}
      {allSettled && (
        <Pressable
          testID="all-settled-bar"
          onPress={() => void closeTrip().then(() => router.back())}
          style={({ pressed }) => ({
            position:        'absolute',
            bottom:          TAB_BAR_HEIGHT,
            left:            0,
            right:           0,
            flexDirection:   'row',
            alignItems:      'center',
            justifyContent:  'center',
            gap:             tokens.spacing.sm,
            padding:         tokens.spacing.md,
            backgroundColor: colors.success.default,
            opacity:         pressed ? 0.85 : 1,
            ...tokens.shadow.lg,
          })}
        >
          <Ionicons name="checkmark-circle" size={20} color={colors.text.inverse} />
          <Text variant="label" color={colors.text.inverse}>All settled — Close Trip</Text>
        </Pressable>
      )}

      {/* Footer links — roll over + close trip (not shown when allSettled) */}
      {!allSettled && (
        <View style={{ paddingBottom: tokens.spacing.lg }}>
          {hasRollableDebts && (
            <Pressable
              testID="roll-over-debts-button"
              onPress={() => router.push(`/settle/rollover/${tripId}` as never)}
              hitSlop={8}
              style={{ alignItems: 'center', paddingVertical: tokens.spacing.sm }}
            >
              <Text variant="caption" color={colors.primary.default}>Roll Over Debts</Text>
            </Pressable>
          )}
          {tripStatus !== 'closed' && (
            <Pressable
              testID="close-trip-button"
              onPress={handleCloseTrip}
              hitSlop={8}
              style={{ alignItems: 'center', paddingVertical: tokens.spacing.sm }}
            >
              <Text variant="caption" color={colors.text.tertiary}>Close Trip</Text>
            </Pressable>
          )}
        </View>
      )}
    </ScreenWrapper>
  );
}
