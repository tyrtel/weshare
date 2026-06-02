import React from 'react';
import { View } from 'react-native';
import { Text } from './Text';
import { useColors } from '../../theme/colors';
import { tokens } from '../../theme/tokens';

interface ClosedTripGuardProps {
  trip: { status: string } | null | undefined;
  message: string;
  children: React.ReactNode;
}

export function ClosedTripGuard({ trip, message, children }: ClosedTripGuardProps) {
  const colors = useColors();

  if (trip?.status === 'closed') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: tokens.spacing.lg }}>
        <Text variant="body" color={colors.text.secondary} style={{ textAlign: 'center' }}>
          {message}
        </Text>
      </View>
    );
  }
  return <>{children}</>;
}
