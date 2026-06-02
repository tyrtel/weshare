import React, { useState } from 'react';
import { View, Pressable, Clipboard } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { SplitStatusBadge } from './SplitStatusBadge';
import { PaymentProofCard } from './PaymentProofCard';
import { useColors } from '../../theme/colors';
import { tokens } from '../../theme/tokens';
import { useService } from '../../core/di/ServiceContext';
import { STRIPE } from '../../core/di/tokens';
import { isOk } from '../../core/types/Result';
import { useStatusPoller } from '../../hooks/useStatusPoller';
import type { SplitRequest, SplitRequestStatus } from '../../core/models/SplitRequest';

const POLL_INTERVAL_MS = 6000;

const TERMINAL: readonly SplitRequestStatus[] = ['completed', 'declined', 'expired'];

interface StripePaymentCardProps {
  splitRequest: SplitRequest;
  checkoutUrl: string;
  payerName?: string;
  payeeName?: string;
  onStatusChange?: (req: SplitRequest, status: SplitRequest['status']) => void;
}

export function StripePaymentCard({ splitRequest, checkoutUrl, payerName, payeeName, onStatusChange }: StripePaymentCardProps) {
  const colors = useColors();
  const stripe = useService(STRIPE);

  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState(splitRequest.status);

  useStatusPoller(
    async () => {
      if (!splitRequest.stripeSessionId) return null;
      const result = await stripe.getPaymentStatus(splitRequest.stripeSessionId);
      return isOk(result) ? result.value : null;
    },
    POLL_INTERVAL_MS,
    (next) => {
      setStatus(next);
      onStatusChange?.({ ...splitRequest, status: next }, next);
    },
    !!splitRequest.stripeSessionId && !TERMINAL.includes(status),
  );

  const handleCopy = () => {
    Clipboard.setString(checkoutUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpen = () => void stripe.openCheckout(checkoutUrl);

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius:    tokens.radius.card,
        padding:         tokens.spacing.md,
        ...tokens.shadow.sm,
      }}
    >
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: tokens.spacing.sm }}>
        <View
          style={{
            width:           32,
            height:          32,
            borderRadius:    tokens.radius.sm,
            backgroundColor: '#1a0040',
            alignItems:      'center',
            justifyContent:  'center',
            marginRight:     tokens.spacing.sm,
          }}
        >
          <Ionicons name="card" size={16} color="#635bff" />
        </View>
        <Text variant="label" color={colors.text.primary} style={{ flex: 1 }}>
          Stripe Payment Link
        </Text>
        <SplitStatusBadge status={status} />
      </View>

      {/* URL row */}
      <View
        style={{
          backgroundColor: colors.surfaceAlt,
          borderRadius:    tokens.radius.sm,
          padding:         tokens.spacing.sm,
          marginBottom:    tokens.spacing.sm,
        }}
      >
        <Text variant="caption" color={colors.text.tertiary} numberOfLines={1}>
          {checkoutUrl}
        </Text>
      </View>

      {/* QR code — shown while payment is still actionable */}
      {!TERMINAL.includes(status) && (
        <View
          style={{
            alignItems:      'center',
            paddingVertical: tokens.spacing.md,
            marginBottom:    tokens.spacing.sm,
          }}
          accessibilityLabel="Stripe checkout QR code"
        >
          <QRCode value={checkoutUrl} size={160} />
          <Text variant="caption" color={colors.text.tertiary} style={{ marginTop: tokens.spacing.xs }}>
            Scan to pay
          </Text>
        </View>
      )}

      {/* Actions */}
      <View style={{ flexDirection: 'row', gap: tokens.spacing.sm }}>
        <Pressable
          onPress={handleCopy}
          accessibilityRole="button"
          accessibilityLabel="Copy payment link"
          style={({ pressed }) => ({
            flex:            1,
            flexDirection:   'row',
            alignItems:      'center',
            justifyContent:  'center',
            backgroundColor: colors.surfaceAlt,
            borderRadius:    tokens.radius.pill,
            paddingVertical: tokens.spacing.sm,
            opacity:         pressed ? 0.7 : 1,
          })}
        >
          <Ionicons
            name={copied ? 'checkmark' : 'copy-outline'}
            size={14}
            color={copied ? colors.success.default : colors.text.secondary}
            style={{ marginRight: 4 }}
          />
          <Text variant="caption" color={copied ? colors.success.default : colors.text.secondary}>
            {copied ? 'Copied' : 'Copy link'}
          </Text>
        </Pressable>

        <Pressable
          onPress={handleOpen}
          accessibilityRole="button"
          accessibilityLabel="Open payment link"
          style={({ pressed }) => ({
            flex:            1,
            flexDirection:   'row',
            alignItems:      'center',
            justifyContent:  'center',
            backgroundColor: colors.primary.default,
            borderRadius:    tokens.radius.pill,
            paddingVertical: tokens.spacing.sm,
            opacity:         pressed ? 0.7 : 1,
          })}
        >
          <Ionicons name="open-outline" size={14} color="#ffffff" style={{ marginRight: 4 }} />
          <Text variant="caption" color="#ffffff">Open</Text>
        </Pressable>
      </View>

      {status === 'completed' && (
        <View style={{ marginTop: tokens.spacing.sm }}>
          <PaymentProofCard
            splitRequest={{ ...splitRequest, status }}
            payerName={payerName}
            payeeName={payeeName}
          />
        </View>
      )}
    </View>
  );
}
