import React from 'react';
import { View, Platform } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { Card } from '../../../components/ui/Card';
import { Text } from '../../../components/ui/Text';
import { Badge } from '../../../components/ui/Badge';
import { MemberAvatarRow } from './MemberAvatarRow';
import { useColors } from '../../../theme/colors';
import { tokens } from '../../../theme/tokens';
import { formatCurrency } from '../../../core/utils/formatCurrency';
import type { Trip } from '../../../core/models/Trip';
import type { TripFinancialSummary } from '../../../core/logic/settlement';

interface TripCardProps {
  trip: Trip;
  index: number;
  onPress: (trip: Trip) => void;
  financialSummary?: TripFinancialSummary | null;
}

function formatRelativeDate(date: Date): string {
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function TripCard({ trip, index, onPress, financialSummary }: TripCardProps) {
  const colors = useColors();
  const entering = Platform.OS !== 'web'
    ? FadeInDown.delay(index * 50).duration(300).springify()
    : undefined;
  const exiting = Platform.OS !== 'web'
    ? FadeOutUp.duration(200).springify()
    : undefined;

  return (
    <Animated.View entering={entering} exiting={exiting}>
    <Card onPress={() => onPress(trip)} style={{ marginBottom: tokens.spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <View style={{ flex: 1, marginRight: tokens.spacing.sm }}>
          <Text variant="heading3" numberOfLines={1}>
            {trip.name}
          </Text>
          <Text
            variant="caption"
            color={colors.text.secondary}
            style={{ marginTop: tokens.spacing.xs }}
          >
            {formatRelativeDate(trip.createdAt)}
          </Text>
        </View>
        <Badge label={trip.currency} />
      </View>

      {trip.members.length > 0 && (
        <View style={{ marginTop: tokens.spacing.sm }}>
          <MemberAvatarRow members={trip.members} />
        </View>
      )}

      {financialSummary != null && (
        <Text
          variant="caption"
          color={
            financialSummary.direction === 'owe'  ? colors.error.default   :
            financialSummary.direction === 'owed' ? colors.success.default :
            colors.text.secondary
          }
          style={{ marginTop: tokens.spacing.xs }}
        >
          {financialSummary.direction === 'owe'
            ? `You owe ${formatCurrency(financialSummary.amountCents, trip.currency)}`
            : financialSummary.direction === 'owed'
              ? `You're owed ${formatCurrency(financialSummary.amountCents, trip.currency)}`
              : 'All settled'}
        </Text>
      )}
    </Card>
    </Animated.View>
  );
}
