import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../../../components/ui/Text';
import { useColors } from '../../../theme/colors';
import { tokens } from '../../../theme/tokens';

interface Props {
  closedAt: Date | null;
  expenseCount: number;
  memberCount: number;
}

function formatCloseDate(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function ClosedTripBanner({ closedAt, expenseCount, memberCount }: Props) {
  const colors = useColors();
  return (
    <View
      testID="closed-trip-banner"
      style={{
        backgroundColor: colors.surface,
        borderRadius: tokens.radius.card,
        borderWidth: 1,
        borderColor: colors.border,
        padding: tokens.spacing.md,
        marginBottom: tokens.spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: tokens.spacing.md,
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: tokens.radius.md,
          backgroundColor: colors.surfaceAlt,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name="archive-outline" size={20} color={colors.text.secondary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="label" color={colors.text.primary}>Trip closed</Text>
        {closedAt && (
          <Text variant="caption" color={colors.text.secondary}>
            Closed {formatCloseDate(closedAt)}
          </Text>
        )}
        <Text variant="caption" color={colors.text.tertiary}>
          {expenseCount} {expenseCount === 1 ? 'expense' : 'expenses'} · {memberCount} {memberCount === 1 ? 'member' : 'members'}
        </Text>
      </View>
    </View>
  );
}
