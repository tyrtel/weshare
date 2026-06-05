import React from 'react';
import { View } from 'react-native';
import { Text } from './Text';
import { useColors } from '../../theme/colors';
import { tokens } from '../../theme/tokens';
import { getStatusDisplay } from '../../core/utils/statusColors';
import type { SplitRequestStatus } from '../../core/models/SplitRequest';

interface SplitStatusBadgeProps {
  status: SplitRequestStatus;
}

export function SplitStatusBadge({ status }: SplitStatusBadgeProps) {
  const colors = useColors();
  const config = getStatusDisplay(status, colors);

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
