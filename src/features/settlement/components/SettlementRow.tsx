import React from 'react';
import { useTranslation } from 'react-i18next';
import { View, Pressable, Platform, ActivityIndicator } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Avatar } from '../../../components/ui/Avatar';
import { Text } from '../../../components/ui/Text';
import { SplitStatusBadge } from '../../../components/ui/SplitStatusBadge';
import { personColorFor, useColors } from '../../../theme/colors';
import { tokens } from '../../../theme/tokens';
import { formatCurrency } from '../../../core/utils/formatCurrency';
import { PAYMENT_FLOW_STATUSES } from '../../../core/models/SplitRequest';
import type { EnrichedSettlement } from '../hooks/useSettlement';
import type { TripMember } from '../../../core/models/TripMember';


function firstName(displayName: string): string {
  return displayName.split(/\s+/)[0];
}

interface SettlementRowProps {
  settlement: EnrichedSettlement;
  members: TripMember[];
  isCurrentUserDebtor: boolean;
  index?: number;
  onPay?: () => void;
  onRecordPayment?: () => void;
  recordPaymentBusy?: boolean;
  onHistory?: () => void;
  showDivider?: boolean;
}

export function SettlementRow({
  settlement,
  members,
  isCurrentUserDebtor,
  index = 0,
  onPay,
  onRecordPayment,
  recordPaymentBusy = false,
  onHistory,
  showDivider = true,
}: SettlementRowProps) {
  const { t } = useTranslation();
  const colors   = useColors();
  const entering = Platform.OS !== 'web'
    ? FadeInDown.delay(index * 50).duration(300).springify()
    : undefined;
  const exiting = Platform.OS !== 'web'
    ? FadeOutUp.duration(200).springify()
    : undefined;
  const fromColor  = personColorFor(settlement.fromUserId, members);
  const toColor    = personColorFor(settlement.toUserId, members);
  const fromMember = members.find(m => m.userId === settlement.fromUserId);
  const toMember   = members.find(m => m.userId === settlement.toUserId);

  const requestStatus       = settlement.latestRequest?.status ?? null;
  const isPaymentFlowStatus = requestStatus !== null && PAYMENT_FLOW_STATUSES.has(requestStatus);
  const isInTransit         = requestStatus === 'pending' || requestStatus === 'authorized';

  const handleRecordPayment = () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onRecordPayment?.();
  };

  return (
    <Animated.View entering={entering} exiting={exiting}>
      <View
        style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: tokens.spacing.md }}
      >

        {/* Left + centre columns — tapping navigates to history */}
        <Pressable
          onPress={onHistory}
          disabled={!onHistory}
          accessibilityRole={onHistory ? 'button' : 'none'}
          accessibilityLabel={onHistory
            ? t('settlement.row.history_label', { from: settlement.fromDisplayName, to: settlement.toDisplayName })
            : undefined}
          style={({ pressed }) => ({
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            opacity: pressed && onHistory ? 0.85 : 1,
          })}
        >
          {/* Debtor — avatar + name */}
          <View style={{ alignItems: 'center', minWidth: 52 }}>
            <Avatar
              initials={settlement.fromDisplayName}
              bg={fromColor.bg}
              url={fromMember?.avatarUrl}
              size="md"
            />
            <Text
              variant="caption"
              color={colors.text.secondary}
              numberOfLines={1}
              style={{ marginTop: 4, textAlign: 'center' }}
            >
              {firstName(settlement.fromDisplayName)}
            </Text>
          </View>

          {/* Amount + arrow + optional status badge */}
          <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: tokens.spacing.sm }}>
            <Text variant="label" color={colors.text.primary} style={{ marginBottom: 4 }}>
              {formatCurrency(settlement.amountCents, settlement.currency)}
            </Text>
            <Ionicons name="arrow-forward" size={16} color={colors.text.tertiary} />
            {settlement.latestRequest && isPaymentFlowStatus && (
              <View style={{ marginTop: 4 }}>
                <SplitStatusBadge status={settlement.latestRequest.status} />
              </View>
            )}
          </View>

          {/* Creditor — avatar + name */}
          <View style={{ alignItems: 'center', minWidth: 52 }}>
            <Avatar
              initials={settlement.toDisplayName}
              bg={toColor.bg}
              url={toMember?.avatarUrl}
              size="md"
            />
            <Text
              variant="caption"
              color={colors.text.secondary}
              numberOfLines={1}
              style={{ marginTop: 4, textAlign: 'center' }}
            >
              {firstName(settlement.toDisplayName)}
            </Text>
          </View>
        </Pressable>

        {/* Action column — sibling of the history Pressable, never nested inside it */}
        <View style={{ marginLeft: tokens.spacing.md, minWidth: 64, alignItems: 'flex-end', gap: tokens.spacing.xs }}>
          {isPaymentFlowStatus ? (
            // In-transit: show spinner; other payment-flow: show chevron to history
            isInTransit ? (
              <ActivityIndicator size="small" color={colors.text.tertiary} accessibilityLabel={t('settlement.row.payment_in_progress')} />
            ) : onHistory ? (
              <Ionicons name="chevron-forward" size={16} color={colors.text.tertiary} />
            ) : null
          ) : (
            // No in-flight payment — show Record payment + optional Pay
            <>
              {isCurrentUserDebtor && onPay && (
                <Pressable
                  onPress={onPay}
                  accessibilityRole="button"
                  accessibilityLabel={t('settlement.row.pay_label', { name: settlement.toDisplayName })}
                  style={({ pressed }) => ({
                    backgroundColor: colors.primary.default,
                    borderRadius: tokens.radius.pill,
                    paddingVertical: tokens.spacing.xs,
                    paddingHorizontal: tokens.spacing.sm,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text variant="caption" color={colors.text.inverse}>{t('settlement.row.pay_button')}</Text>
                </Pressable>
              )}
              {onRecordPayment && (
                <Pressable
                  onPress={recordPaymentBusy ? undefined : handleRecordPayment}
                  accessibilityRole="button"
                  accessibilityLabel={t('settlement.row.record_payment_label', { from: settlement.fromDisplayName, to: settlement.toDisplayName })}
                  style={({ pressed }) => ({
                    borderRadius: tokens.radius.pill,
                    paddingVertical: tokens.spacing.xs,
                    paddingHorizontal: tokens.spacing.sm,
                    borderWidth: 1,
                    borderColor: colors.border,
                    opacity: recordPaymentBusy || pressed ? 0.5 : 1,
                    minWidth: 72,
                    alignItems: 'center',
                  })}
                >
                  {recordPaymentBusy
                    ? <ActivityIndicator size="small" color={colors.text.secondary} />
                    : <Text variant="caption" color={colors.text.secondary}>{t('settlement.row.record_payment')}</Text>
                  }
                </Pressable>
              )}
            </>
          )}
        </View>

      </View>

      {showDivider && (
        <View style={{ height: 1, backgroundColor: colors.borderMuted }} />
      )}
    </Animated.View>
  );
}
