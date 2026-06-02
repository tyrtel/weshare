import React from 'react';
import { View, Pressable, Platform } from 'react-native';
import Animated, { SlideInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../../../components/ui/Text';
import { Badge } from '../../../components/ui/Badge';
import { MemberAvatarRow } from './MemberAvatarRow';
import { BalanceBubblesSection } from './BalanceBubblesSection';
import { ClosedTripBanner } from './ClosedTripBanner';
import { TripActivityHeader } from './TripActivityHeader';
import { useColors } from '../../../theme/colors';
import { tokens } from '../../../theme/tokens';
import type { Trip } from '../../../core/models/Trip';
import type { Expense } from '../../../core/models/Expense';

interface TripListHeaderProps {
  trip: Trip;
  expenses: Expense[];
  showAllExpenses: boolean;
  onBack: () => void;
  onEdit: () => void;
  onCloseTrip: () => void;
  onSettleUp: () => void;
  onToggleShowAll: () => void;
}

export function TripListHeader({
  trip,
  expenses,
  showAllExpenses,
  onBack,
  onEdit,
  onCloseTrip,
  onSettleUp,
  onToggleShowAll,
}: TripListHeaderProps) {
  const colors = useColors();

  return (
    <>
      {/* Trip header */}
      <Animated.View
        entering={Platform.OS !== 'web' ? SlideInDown.duration(400).springify() : undefined}
        style={{ marginBottom: tokens.spacing.md }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: tokens.spacing.xs }}>
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={{ marginRight: tokens.spacing.sm, padding: tokens.spacing.xs }}
            hitSlop={8}
          >
            <Ionicons name="chevron-back" size={22} color={colors.text.secondary} />
          </Pressable>
          <Text variant="heading1" style={{ flex: 1 }} numberOfLines={1}>
            {trip.name}
          </Text>
          {trip.status !== 'closed' && (
            <Pressable
              onPress={onEdit}
              accessibilityRole="button"
              accessibilityLabel="Edit trip"
              style={{ padding: tokens.spacing.xs, marginRight: tokens.spacing.xs }}
              hitSlop={8}
            >
              <Ionicons name="pencil-outline" size={18} color={colors.text.secondary} />
            </Pressable>
          )}
          {trip.status !== 'closed' && (
            <Pressable
              testID="close-trip-button"
              onPress={onCloseTrip}
              accessibilityRole="button"
              accessibilityLabel="Close trip"
              style={{ padding: tokens.spacing.xs, marginRight: tokens.spacing.xs }}
              hitSlop={8}
            >
              <Ionicons name="archive-outline" size={18} color={colors.text.secondary} />
            </Pressable>
          )}
          <Badge label={trip.currency} />
        </View>

        {trip.members.length > 0 && <MemberAvatarRow members={trip.members} />}
      </Animated.View>

      {/* Closed banner or balance bubbles */}
      {trip.status === 'closed' ? (
        <ClosedTripBanner
          closedAt={trip.closedAt}
          expenseCount={expenses.length}
          memberCount={trip.members.length}
        />
      ) : (
        <BalanceBubblesSection
          members={trip.members}
          expenses={expenses}
          currency={trip.currency}
        />
      )}

      {/* Settle up button — hidden when closed */}
      {trip.status !== 'closed' && expenses.length > 0 && (
        <Pressable
          onPress={onSettleUp}
          accessibilityRole="button"
          accessibilityLabel={trip.status === 'settling' ? 'Continue settling' : 'Settle up'}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: tokens.spacing.xs,
            borderWidth: 1,
            borderColor: trip.status === 'settling' ? colors.warning.default : colors.primary.dim,
            borderRadius: tokens.radius.md,
            paddingVertical: tokens.spacing.sm,
            marginBottom: tokens.spacing.md,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text
            variant="label"
            color={trip.status === 'settling' ? colors.warning.default : colors.primary.default}
          >
            {trip.status === 'settling' ? 'Settling in progress' : 'Settle Up'}
          </Text>
          <Ionicons
            name={trip.status === 'settling' ? 'time-outline' : 'calculator-outline'}
            size={15}
            color={trip.status === 'settling' ? colors.warning.default : colors.primary.default}
          />
        </Pressable>
      )}

      {/* Activity section title + Show all toggle */}
      <TripActivityHeader
        count={expenses.length}
        showAll={showAllExpenses}
        onToggleShowAll={onToggleShowAll}
      />
    </>
  );
}
