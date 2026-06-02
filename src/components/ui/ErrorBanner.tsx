import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from './Text';
import { useColors } from '../../theme/colors';
import { tokens } from '../../theme/tokens';
import type { AppError } from '../../core/types/AppError';

interface ErrorBannerProps {
  error: AppError | null | undefined;
  fallback?: string;
  style?: StyleProp<ViewStyle>;
}

export function ErrorBanner({ error, fallback = 'Something went wrong.', style }: ErrorBannerProps) {
  const colors = useColors();
  if (!error) return null;
  const message = 'message' in error ? error.message : fallback;
  return (
    <View
      style={[
        {
          padding: tokens.spacing.sm,
          backgroundColor: colors.error.bg,
          borderRadius: tokens.radius.md,
        },
        style,
      ]}
    >
      <Text variant="caption" color={colors.error.default}>
        {message}
      </Text>
    </View>
  );
}
