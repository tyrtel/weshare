import React from 'react';
import { View, FlatList, Pressable, Platform, ActivityIndicator } from 'react-native';
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
import { useTranslation } from 'react-i18next';

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

  return trips
    .filter(trip => trip.status !== 'closed')
    .map(trip => ({
      trip,
      netCents: computeNetBalance(currentUserId, allExpenses[trip.id] ?? []),
      currency: trip.currency,
    }));
}

function BalanceRow({ item, index }: { item: TripBalance; index: number }) {
  const { t } = useTranslation();
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
    ? t('balance.row.owed', { amount: formatCents(netCents, currency) })
    : isOwe
    ? t('balance.row.owe', { amount: formatCents(Math.abs(netCents), currency) })
    : t('balance.row.settled');

  return (
    <Animated.View entering={entering} exiting={exiting}>
      <Pressable
        onPress={() => router.push(`/trip/${item.trip.id}`)}
        accessibilityRole="button"
        accessibilityLabel={t('balance.row.view_trip_label', { name: item.trip.name })}
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
            {t('balance.row.member_count', { count: item.trip.members.length })}
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

function TotalsFooter({ rows }: { rows: TripBalance[] }) {
  const { t } = useTranslation();
  const colors = useColors();

  // Sum net balance per currency across all visible trips.
  const byCurrency = new Map<string, number>();
  for (const { netCents, currency } of rows) {
    byCurrency.set(currency, (byCurrency.get(currency) ?? 0) + netCents);
  }
  const entries = [...byCurrency.entries()];

  if (entries.length === 0) return null;

  return (
    <View
      style={{
        borderTopWidth: 1,
        borderTopColor: colors.border,
        marginTop: tokens.spacing.sm,
        paddingTop: tokens.spacing.md,
      }}
    >
      <Text variant="label" color={colors.text.secondary} style={{ marginBottom: tokens.spacing.sm }}>
        {t('balance.footer.net_total_label')}
      </Text>
      {entries.map(([currency, netCents]) => {
        const isOwed = netCents > 0;
        const isOwe  = netCents < 0;
        const color  = isOwed ? colors.success.default : isOwe ? colors.error.default : colors.text.tertiary;
        const label  = isOwed
          ? t('balance.row.owed', { amount: formatCents(netCents, currency) })
          : isOwe
          ? t('balance.row.owe', { amount: formatCents(Math.abs(netCents), currency) })
          : t('balance.row.settled');
        return (
          <View key={currency} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: tokens.spacing.xs }}>
            <Text variant="body" color={colors.text.primary}>{currency}</Text>
            <Text variant="body" color={color} style={{ fontWeight: tokens.fontWeight.semibold }}>
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function EmptyState() {
  const { t } = useTranslation();
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
        {t('balance.empty.title')}
      </Text>
      <Text variant="body" color={colors.text.secondary} style={{ textAlign: 'center' }}>
        {t('balance.empty.body')}
      </Text>
    </View>
  );
}

export function BalanceSummaryScreen() {
  const { t } = useTranslation();
  const rows       = useBalanceSummary();
  const isHydrated = useTripSessionStore(s => s.isHydrated);
  const colors     = useColors();

  return (
    <ScreenWrapper>
      <View
        style={{
          paddingHorizontal: tokens.spacing.md,
          paddingTop: tokens.spacing.md,
          paddingBottom: tokens.spacing.sm,
        }}
      >
        <Text variant="heading1">{t('balance.screen.title')}</Text>
      </View>

      {!isHydrated ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary.default} size="large" />
        </View>
      ) : (
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
        ListFooterComponent={rows.length > 0 ? <TotalsFooter rows={rows} /> : null}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          rows.length > 0 ? (
            <Text
              variant="label"
              color={colors.text.secondary}
              style={{ marginBottom: tokens.spacing.sm }}
            >
              {t('balance.list.trip_count', { count: rows.length })}
            </Text>
          ) : null
        }
      />
      )}
    </ScreenWrapper>
  );
}
