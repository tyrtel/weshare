import React from 'react';
import { View, FlatList, Pressable, Platform } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '../../../components/ui/ScreenWrapper';
import { Text } from '../../../components/ui/Text';
import { Badge } from '../../../components/ui/Badge';
import { useTripSessionStore, useService } from '../../../core/di/ServiceContext';
import { AUTH } from '../../../core/di/tokens';
import { useColors } from '../../../theme/colors';
import { tokens } from '../../../theme/tokens';
import { formatCents } from '../../../hooks/computations/splitTotals';
import type { Trip } from '../../../core/models/Trip';
import type { Expense } from '../../../core/models/Expense';

interface TripBalance {
  trip: Trip;
  netCents: number;
  currency: string;
}

function computeNetBalance(currentUserId: string, expenses: Expense[]): number {
  const paidCents = expenses
    .filter(e => e.paidByUserId === currentUserId)
    .reduce((sum, e) => sum + e.totalAmountCents, 0);
  const owedCents = expenses
    .flatMap(e => e.splits)
    .filter(s => s.userId === currentUserId)
    .reduce((sum, s) => sum + s.amountOwedCents, 0);
  return paidCents - owedCents;
}

function useBalanceSummary(): TripBalance[] {
  const trips = useTripSessionStore(s => s.trips);
  const allExpenses = useTripSessionStore(s => s.expenses);
  const auth = useService(AUTH);
  const currentUserId = auth.currentUser()?.id ?? null;

  if (!currentUserId) return [];

  return trips.map(trip => ({
    trip,
    netCents: computeNetBalance(currentUserId, allExpenses[trip.id] ?? []),
    currency: trip.currency,
  }));
}

function BalanceRow({ item, index }: { item: TripBalance; index: number }) {
  const colors  = useColors();
  const router  = useRouter();
  const entering = Platform.OS !== 'web'
    ? FadeInDown.delay(index * 50).duration(300).springify()
    : undefined;
  const exiting = Platform.OS !== 'web'
    ? FadeOutUp.duration(200).springify()
    : undefined;

  const { netCents, currency } = item;
  const isOwed = netCents > 0;
  const isOwe  = netCents < 0;

  const balanceColor = isOwed
    ? colors.success.default
    : isOwe
    ? colors.error.default
    : colors.text.tertiary;

  const balanceLabel = isOwed
    ? `owed ${formatCents(netCents, currency)}`
    : isOwe
    ? `owe ${formatCents(Math.abs(netCents), currency)}`
    : 'settled';

  return (
    <Animated.View entering={entering} exiting={exiting}>
      <Pressable
        onPress={() => router.push(`/trip/${item.trip.id}`)}
        accessibilityRole="button"
        accessibilityLabel={`View trip ${item.trip.name}`}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: tokens.spacing.md,
          paddingHorizontal: tokens.spacing.md,
          backgroundColor: colors.surface,
          borderRadius: tokens.radius.card,
          marginBottom: tokens.spacing.sm,
          opacity: pressed ? 0.75 : 1,
          ...tokens.shadow.sm,
        })}
      >
        <View style={{ flex: 1 }}>
          <Text variant="label" color={colors.text.primary} numberOfLines={1}>
            {item.trip.name}
          </Text>
          <Text variant="caption" color={colors.text.tertiary} style={{ marginTop: 2 }}>
            {item.trip.members.length} {item.trip.members.length === 1 ? 'member' : 'members'}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: tokens.spacing.xs, marginRight: tokens.spacing.xs }}>
          <Badge label={currency} />
          <Text variant="caption" color={balanceColor} style={{ fontWeight: tokens.fontWeight.semibold }}>
            {balanceLabel}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.text.tertiary} />
      </Pressable>
    </Animated.View>
  );
}

function EmptyState() {
  const colors = useColors();
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: tokens.spacing.xl,
      }}
    >
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 32,
          backgroundColor: colors.surface,
          borderWidth: 2,
          borderColor: colors.border,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: tokens.spacing.md,
        }}
      >
        <Text variant="heading2" color={colors.text.tertiary}>€</Text>
      </View>
      <Text variant="heading2" style={{ marginBottom: tokens.spacing.sm, textAlign: 'center' }}>
        No balance yet
      </Text>
      <Text variant="body" color={colors.text.secondary} style={{ textAlign: 'center' }}>
        Join or create a trip to see your balance here.
      </Text>
    </View>
  );
}

export function BalanceSummaryScreen() {
  const rows = useBalanceSummary();
  const colors = useColors();

  return (
    <ScreenWrapper>
      <View
        style={{
          paddingHorizontal: tokens.spacing.md,
          paddingTop: tokens.spacing.md,
          paddingBottom: tokens.spacing.sm,
        }}
      >
        <Text variant="heading1">Balance</Text>
      </View>

      <FlatList
        data={rows}
        keyExtractor={item => item.trip.id}
        renderItem={({ item, index }) => <BalanceRow item={item} index={index} />}
        contentContainerStyle={{
          paddingHorizontal: tokens.spacing.md,
          paddingBottom: tokens.spacing.xxl,
          flexGrow: 1,
        }}
        ListEmptyComponent={<EmptyState />}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          rows.length > 0 ? (
            <Text
              variant="label"
              color={colors.text.secondary}
              style={{ marginBottom: tokens.spacing.sm }}
            >
              {rows.length} {rows.length === 1 ? 'trip' : 'trips'}
            </Text>
          ) : null
        }
      />
    </ScreenWrapper>
  );
}
