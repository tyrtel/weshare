import React from 'react';
import { View } from 'react-native';
import { Text } from './Text';
import { useColors } from '../../theme/colors';
import { tokens } from '../../theme/tokens';
import type { SplitRequestStatus } from '../../core/models/SplitRequest';

interface StatusConfig {
  label: string;
  textColor: string;
  bgColor: string;
}

function useStatusConfig(status: SplitRequestStatus, colors: ReturnType<typeof useColors>): StatusConfig {
  switch (status) {
    case 'owed':
      return { label: 'Owes',      textColor: colors.text.secondary,  bgColor: colors.surfaceAlt };
    case 'paid':
      return { label: 'Paid',      textColor: colors.success.default, bgColor: colors.success.bg };
    case 'created':
      return { label: 'Created',   textColor: colors.text.secondary,  bgColor: colors.surfaceAlt };
    case 'request_sent':
      return { label: 'Sent',      textColor: '#60a5fa',              bgColor: '#0d1e3a' };
    case 'authorized':
      return { label: 'Authorised',textColor: '#60a5fa',              bgColor: '#0d1e3a' };
    case 'pending':
      return { label: 'Pending',   textColor: colors.warning.default, bgColor: colors.warning.bg };
    case 'completed':
      return { label: 'Paid',      textColor: colors.success.default, bgColor: colors.success.bg };
    case 'declined':
      return { label: 'Declined',  textColor: colors.error.default,   bgColor: colors.error.bg };
    case 'expired':
      return { label: 'Expired',   textColor: colors.text.tertiary,   bgColor: colors.surfaceAlt };
  }
}

interface SplitStatusBadgeProps {
  status: SplitRequestStatus;
}

export function SplitStatusBadge({ status }: SplitStatusBadgeProps) {
  const colors = useColors();
  const config = useStatusConfig(status, colors);

  return (
    <View
      style={{
        backgroundColor:  config.bgColor,
        borderRadius:     tokens.radius.pill,
        paddingVertical:  2,
        paddingHorizontal: tokens.spacing.sm,
        alignSelf:        'flex-start',
      }}
      accessibilityLabel={`Payment status: ${config.label}`}
    >
      <Text variant="caption" color={config.textColor}>
        {config.label}
      </Text>
    </View>
  );
}
