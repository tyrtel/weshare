import React from 'react';
import { View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Text } from '../../../components/ui/Text';
import { Badge } from '../../../components/ui/Badge';
import { MemberAvatarRow } from './MemberAvatarRow';
import { useColors } from '../../../theme/colors';
import { tokens } from '../../../theme/tokens';
import type { Trip } from '../../../core/models/Trip';

interface Props {
  trip: Trip;
  expenseCount: number;
}

function formatDateRange(createdAt: Date, closedAt: Date | null): string {
  const start = createdAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  if (!closedAt) return start;
  const end = closedAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${start} – ${end}`;
}

export function ClosedTripCard({ trip, expenseCount }: Props) {
  const router = useRouter();
  const colors = useColors();

  return (
    <Pressable
      testID={`closed-trip-card-${trip.id}`}
      onPress={() => router.push(`/trip/${trip.id}`)}
      accessibilityRole="button"
      accessibilityLabel={trip.name}
      style={({ pressed }) => ({
        backgroundColor: colors.surface,
        borderRadius: tokens.radius.card,
        padding: tokens.spacing.md,
        marginBottom: tokens.spacing.sm,
        opacity: pressed ? 0.6 : 0.75,
        ...tokens.shadow.sm,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Text variant="heading3" numberOfLines={1} color={colors.text.secondary} style={{ flex: 1, marginRight: tokens.spacing.sm }}>
          {trip.name}
        </Text>
        <Badge label={trip.currency} />
      </View>

      <Text variant="caption" color={colors.text.tertiary} style={{ marginTop: tokens.spacing.xs }}>
        {formatDateRange(trip.createdAt, trip.closedAt)}
      </Text>

      {trip.members.length > 0 && (
        <View style={{ marginTop: tokens.spacing.sm, opacity: 0.7 }}>
          <MemberAvatarRow members={trip.members} />
        </View>
      )}

      <Text variant="caption" color={colors.text.tertiary} style={{ marginTop: tokens.spacing.xs }}>
        {expenseCount} {expenseCount === 1 ? 'expense' : 'expenses'}
      </Text>
    </Pressable>
  );
}
