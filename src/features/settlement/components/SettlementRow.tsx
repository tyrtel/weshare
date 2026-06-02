import React from 'react';
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
  onPay?: () => void;       // debtor only: open payment sheet
  onMarkPaid?: () => void;  // any participant: manually mark debt paid
  onMarkOwed?: () => void;  // any participant: revert 'paid' -> 'owed'
  onHistory?: () => void;
  showDivider?: boolean;
}

export function SettlementRow({
  settlement,
  members,
  isCurrentUserDebtor,
  index = 0,
  onPay,
  onMarkPaid,
  onMarkOwed,
  onHistory,
  showDivider = true,
}: SettlementRowProps) {
  const colors   = useColors();
  const entering = Platform.OS !== 'web'
    ? FadeInDown.delay(index * 50).duration(300).springify()
    : undefined;
  const exiting = Platform.OS !== 'web'
    ? FadeOutUp.duration(200).springify()
    : undefined;
  const fromColor = personColorFor(settlement.fromUserId, members);
  const toColor   = personColorFor(settlement.toUserId, members);

  const requestStatus       = settlement.latestRequest?.status ?? null;
  const isPaymentFlowStatus = requestStatus !== null && PAYMENT_FLOW_STATUSES.has(requestStatus);
  const isPaid              = requestStatus === 'paid' || requestStatus === 'completed';
  const isInTransit         = requestStatus === 'pending' || requestStatus === 'authorized';

  const handleMarkPaid = () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onMarkPaid?.();
  };

  return (
    <Animated.View entering={entering} exiting={exiting}>
      <View
        style={[
          { flexDirection: 'row', alignItems: 'center', paddingVertical: tokens.spacing.md },
          isPaid && {
            backgroundColor: colors.success.bg,
            borderLeftWidth: 3,
            borderLeftColor: colors.success.default,
            paddingLeft: tokens.spacing.sm,
          },
        ]}
      >

        {/* Left + centre columns — tapping navigates to history */}
        <Pressable
          onPress={onHistory}
          disabled={!onHistory}
          accessibilityRole={onHistory ? 'button' : 'none'}
          accessibilityLabel={onHistory
            ? `View payment history for ${settlement.fromDisplayName} and ${settlement.toDisplayName}`
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
              color={fromColor.text}
              size="md"
            />
            <Text
              variant="caption"
              color={colors.text.secondary}
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
            {settlement.latestRequest && requestStatus !== 'owed' && (
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
              color={toColor.text}
              size="md"
            />
            <Text
              variant="caption"
              color={colors.text.secondary}
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
              <ActivityIndicator size="small" color={colors.text.tertiary} accessibilityLabel="Payment in progress" />
            ) : onHistory ? (
              <Ionicons name="chevron-forward" size={16} color={colors.text.tertiary} />
            ) : null
          ) : isPaid ? (
            // Debt marked paid — checkmark + optional undo
            <View style={{ alignItems: 'flex-end', gap: tokens.spacing.xs }}>
              <Ionicons name="checkmark-circle" size={20} color={colors.success.default} accessibilityLabel="Paid" />
              {onMarkOwed ? (
                <Pressable
                  onPress={onMarkOwed}
                  accessibilityRole="button"
                  accessibilityLabel="Undo mark as paid"
                  style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                >
                  <Text variant="caption" color={colors.text.tertiary}>Undo</Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            // Owed / no request yet — show Mark Paid + optional Pay
            <>
              {isCurrentUserDebtor && onPay && (
                <Pressable
                  onPress={onPay}
                  accessibilityRole="button"
                  accessibilityLabel={`Pay ${settlement.toDisplayName}`}
                  style={({ pressed }) => ({
                    backgroundColor: colors.primary.default,
                    borderRadius: tokens.radius.pill,
                    paddingVertical: tokens.spacing.xs,
                    paddingHorizontal: tokens.spacing.sm,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text variant="caption" color="#ffffff">Pay</Text>
                </Pressable>
              )}
              {onMarkPaid && (
                <Pressable
                  onPress={handleMarkPaid}
                  accessibilityRole="button"
                  accessibilityLabel="Mark as paid"
                  style={({ pressed }) => ({
                    borderRadius: tokens.radius.pill,
                    paddingVertical: tokens.spacing.xs,
                    paddingHorizontal: tokens.spacing.sm,
                    borderWidth: 1,
                    borderColor: colors.border,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text variant="caption" color={colors.text.secondary}>Mark Paid</Text>
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
