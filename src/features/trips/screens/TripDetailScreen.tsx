import React, { useState, useCallback, useMemo } from 'react';
import { View, FlatList, Pressable, RefreshControl, StyleSheet, Share } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenWrapper } from '../../../components/ui/ScreenWrapper';
import { TAB_BAR_HEIGHT } from '../../../components/ui/UniversalTabBar';
import { TripDetailSkeleton } from '../../../components/skeletons/TripDetailSkeleton';
import { Text } from '../../../components/ui/Text';
import { Ionicons } from '@expo/vector-icons';
import { Feather } from '@expo/vector-icons';
import { ExpenseRow } from '../components/ExpenseRow';
import { TripFAB } from '../components/TripFAB';
import { TripListHeader } from '../components/TripListHeader';
import { LedgerBars } from '../../../components/ui/LedgerBars';
import { BalanceViewSelector } from '../../../components/ui/BalanceViewSelector';
import { useBalanceView } from '../../../core/hooks/useBalanceView';
import { useTripDetail } from '../hooks/useTripDetail';
import { useService } from '../../../core/di/ServiceContext';
import { TRIP_STORE, AUTH } from '../../../core/di/tokens';
import { confirm } from '../../../core/utils/confirm';
import { useColors, ledgerColors } from '../../../theme/colors';
import { tokens, ledgerRadius, ledgerShadow, ledgerFonts } from '../../../theme/tokens';
import { useActiveTheme } from '../../../core/ThemeContext';
import { formatCurrency } from '../../../core/utils/formatCurrency';
import { computeMemberNetBalances } from '../../../core/logic/settlement';
import type { Expense } from '../../../core/models/Expense';

function PlateIllustration() {
  const colors = useColors();
  return (
    <View style={{ alignItems: 'center', marginBottom: tokens.spacing.lg }}>
      <View
        style={{
          width: 80,
          height: 80,
          borderRadius: 40,
          backgroundColor: colors.surface,
          borderWidth: 3,
          borderColor: colors.border,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: 60,
            height: 60,
            borderRadius: 30,
            backgroundColor: colors.surfaceAlt,
            borderWidth: 1,
            borderColor: colors.borderMuted,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text variant="heading2" color={colors.text.tertiary}>?</Text>
        </View>
      </View>
    </View>
  );
}

function EmptyExpenses() {
  const { t } = useTranslation();
  const colors = useColors();
  return (
    <View
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: tokens.spacing.xxl,
        paddingHorizontal: tokens.spacing.xl,
      }}
    >
      <PlateIllustration />
      <Text variant="body" color={colors.text.secondary} style={{ textAlign: 'center' }}>
        {t('trips.detail.empty_expenses')}
      </Text>
    </View>
  );
}

export function TripDetailScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router  = useRouter();
  const colors  = useColors();
  const activeTheme = useActiveTheme();
  const isLedger = activeTheme === 'ledger';
  const { trip: tripBalanceView, setTrip: setTripBalanceView } = useBalanceView();
  const auth = useService(AUTH);
  const { trip, expenses, loading, error, refetch } = useTripDetail(id);
  const [refreshing,       setRefreshing]       = useState(false);
  const [showAllExpenses,  setShowAllExpenses]  = useState(false);

  const isExtended = expenses.length === 0 && !!trip;

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleAddExpense   = () => { router.push(`/expense/add?tripId=${id}`); };
  const handleExpensePress = (expense: Expense) => { router.push(`/expense/${expense.id}`); };

  const storeApi = useService(TRIP_STORE);

  const handleCloseTrip = useCallback(() => {
    if (!trip) return;
    void confirm(
      t('trips.detail.close_alert_title'),
      t('trips.detail.close_alert_message'),
      t('trips.detail.close_alert_confirm'),
    ).then(confirmed => {
      if (confirmed) void storeApi.getState().setTripStatus(trip.id, 'closed').then(() => router.back());
    });
  }, [trip, storeApi, router, t]);

  const handleSettleUp = useCallback(() => {
    if (!trip) return;
    router.push(`/settle/${trip.id}`);
  }, [trip, router]);

  const visibleExpenses = useMemo(
    () => showAllExpenses ? expenses : expenses.slice(0, 3),
    [showAllExpenses, expenses],
  );

  if (loading && !trip) {
    return <ScreenWrapper isLoading skeleton={<TripDetailSkeleton />} />;
  }

  if (error || !trip) {
    return (
      <ScreenWrapper>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: tokens.spacing.lg }}>
          <Text variant="body" color={colors.error.default} style={{ textAlign: 'center' }}>
            {error?.kind === 'NotFoundError' ? t('trips.detail.error_not_found') : t('trips.detail.error_load')}
          </Text>
        </View>
      </ScreenWrapper>
    );
  }

  if (isLedger && trip) {
    const total = expenses.reduce((s, e) => s + e.amountCents, 0);
    const perHead = trip.members.length > 0 ? Math.round(total / trip.members.length) : 0;

    const memberBalancesList = computeMemberNetBalances(trip.members, expenses);
    const currentUserId = auth.currentUser()?.id ?? '';
    const myBalance = memberBalancesList.find(b => b.userId === currentUserId)?.balanceCents ?? 0;

    const balancesRecord = Object.fromEntries(memberBalancesList.map(b => [b.userId, b.balanceCents]));
    const membersForBars = trip.members.map(m => ({
      userId: m.userId,
      displayName: m.displayName,
      avatarUrl: m.avatarUrl,
    }));

    const handleInvite = () => Share.share({ message: `Join "${trip.name}" on WeShare` });

    return (
      <ScreenWrapper>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView edges={['top']} style={{ backgroundColor: ledgerColors.background }}>
          {/* Title row */}
          <View style={tripStyles.titleRow}>
            <Pressable onPress={() => router.back()} hitSlop={10}>
              <Feather name="chevron-left" size={26} color={ledgerColors.text.primary} />
            </Pressable>
            <View style={{ alignItems: 'center', flex: 1 }}>
              <Text style={tripStyles.title} numberOfLines={1}>
                {trip.emoji ?? '✈️'}{'  '}{trip.name}
              </Text>
            </View>
            <Pressable
              onPress={() => router.push(`/trip/edit?id=${trip.id}` as Parameters<typeof router.push>[0])}
              hitSlop={10}
            >
              <Feather name="edit-2" size={18} color={ledgerColors.text.secondary} />
            </Pressable>
          </View>
        </SafeAreaView>

        <FlatList
          data={visibleExpenses}
          keyExtractor={item => item.id}
          renderItem={({ item, index }) => (
            <Pressable
              key={item.id}
              onPress={() => handleExpensePress(item)}
              style={({ pressed }) => [tripStyles.expenseRow, { opacity: pressed ? 0.8 : 1 }]}
            >
              <View style={tripStyles.iconTile}>
                <Feather name="file-text" size={16} color={ledgerColors.primary.default} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={tripStyles.expTitle} numberOfLines={1}>{item.description}</Text>
                <Text style={tripStyles.expMeta}>
                  {trip.members.find(m => m.userId === item.paidByUserId)?.displayName ?? 'Unknown'} paid · {item.splitMode ?? 'equal'}
                </Text>
              </View>
              <Text style={tripStyles.expAmount}>
                {formatCurrency(item.amountCents, trip.currency)}
              </Text>
            </Pressable>
          )}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 80 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={ledgerColors.primary.default}
              colors={[ledgerColors.primary.default]}
            />
          }
          ListHeaderComponent={
            <View style={{ backgroundColor: ledgerColors.background }}>
              {/* Stat strip card */}
              <View style={[tripStyles.card, { marginBottom: 20, marginTop: 8 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={tripStyles.stat}>
                    <Text style={tripStyles.statLabel}>TRIP TOTAL</Text>
                    <Text style={tripStyles.statValue}>{formatCurrency(total, trip.currency)}</Text>
                  </View>
                  <View style={tripStyles.statDivider} />
                  <View style={tripStyles.stat}>
                    <Text style={tripStyles.statLabel}>PER PERSON</Text>
                    <Text style={tripStyles.statValue}>{formatCurrency(perHead, trip.currency)}</Text>
                  </View>
                  <View style={tripStyles.statDivider} />
                  <View style={tripStyles.stat}>
                    <Text style={tripStyles.statLabel}>YOUR NET</Text>
                    <Text style={[tripStyles.statValue, {
                      color: myBalance >= 0 ? ledgerColors.success.default : ledgerColors.error.default,
                    }]}>
                      {myBalance >= 0 ? '+' : '−'}{formatCurrency(Math.abs(myBalance), trip.currency)}
                    </Text>
                  </View>
                </View>
                <View style={tripStyles.hairline} />
                <BalanceViewSelector
                  balances={balancesRecord}
                  members={membersForBars}
                  viewMode={tripBalanceView}
                  onChangeView={setTripBalanceView}
                  currency={trip.currency}
                />
                {trip.status !== 'closed' && expenses.length > 0 && (
                  <Pressable
                    onPress={handleSettleUp}
                    style={({ pressed }) => [tripStyles.settleBtn, { opacity: pressed ? 0.85 : 1, marginTop: 12 }]}
                  >
                    <Feather name="check-circle" size={16} color="#fff" />
                    <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>Settle trip</Text>
                  </Pressable>
                )}
              </View>

              {/* Participants row */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
                {trip.members.map((m, i) => (
                  <View key={m.userId} style={{ alignItems: 'center', gap: 4 }}>
                    <View style={{
                      width: 44, height: 44, borderRadius: 22,
                      backgroundColor: ledgerColors.primary.subtle,
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Text style={{ fontSize: 18, fontWeight: '600', color: ledgerColors.primary.default }}>
                        {m.displayName.trim().charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 12, fontWeight: '500', color: ledgerColors.text.primary }}>
                      {m.displayName.split(' ')[0]}
                    </Text>
                  </View>
                ))}
                <Pressable onPress={handleInvite} style={{ alignItems: 'center', gap: 4 }}>
                  <View style={tripStyles.inviteCircle}>
                    <Feather name="user-plus" size={18} color={ledgerColors.primary.default} />
                  </View>
                  <Text style={{ fontSize: 12, fontWeight: '500', color: ledgerColors.primary.default }}>Invite</Text>
                </Pressable>
              </View>

              {/* Expenses section header */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
                <Text style={tripStyles.sectionTitle}>Expenses</Text>
                {trip.status !== 'closed' && (
                  <Pressable onPress={handleAddExpense} hitSlop={8}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: ledgerColors.primary.default }}>Add</Text>
                  </Pressable>
                )}
              </View>
            </View>
          }
          ListEmptyComponent={
            <View style={{ padding: 24, alignItems: 'center' }}>
              <Text style={{ color: ledgerColors.text.tertiary, fontSize: 13 }}>No expenses yet</Text>
            </View>
          }
        />

        {trip.status !== 'closed' && (
          <TripFAB
            isExtended={expenses.length === 0}
            onAddExpense={handleAddExpense}
            onAddPeople={() => router.push(`/add-participant?tripId=${trip.id}`)}
          />
        )}
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <Stack.Screen options={{ headerShown: false }} />

      <FlatList
        data={visibleExpenses}
        keyExtractor={item => item.id}
        renderItem={({ item, index }) => (
          <ExpenseRow
            expense={item}
            members={trip.members}
            index={index}
            onPress={handleExpensePress}
            showDivider={index < visibleExpenses.length - 1}
          />
        )}
        contentContainerStyle={{
          paddingHorizontal: tokens.spacing.md,
          paddingBottom: tokens.spacing.xxl + tokens.spacing.xl + TAB_BAR_HEIGHT,
          flexGrow: 1,
        }}
        ListHeaderComponent={
          <TripListHeader
            trip={trip}
            expenses={expenses}
            showAllExpenses={showAllExpenses}
            onBack={() => router.back()}
            onEdit={() => router.push(`/trip/edit?id=${trip.id}`)}
            onCloseTrip={handleCloseTrip}
            onSettleUp={handleSettleUp}
            onToggleShowAll={() => setShowAllExpenses(prev => !prev)}
          />
        }
        ListEmptyComponent={<EmptyExpenses />}
        ListFooterComponent={expenses.length > 0 ? (
          <Pressable
            onPress={() => router.push(`/trip/activity?id=${trip.id}`)}
            accessibilityRole="button"
            accessibilityLabel={t('trips.detail.view_activity_label')}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: tokens.spacing.xs,
              paddingVertical: tokens.spacing.md,
              marginTop: tokens.spacing.sm,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Text variant="caption" color={colors.primary.light}>{t('trips.detail.view_activity')}</Text>
            <Ionicons name="chevron-forward" size={13} color={colors.primary.light} />
          </Pressable>
        ) : null}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary.default}
            colors={[colors.primary.default]}
          />
        }
      />

      {trip.status !== 'closed' && (
        <TripFAB
          isExtended={isExtended}
          onAddExpense={handleAddExpense}
          onAddPeople={() => router.push(`/add-participant?tripId=${trip.id}`)}
        />
      )}
    </ScreenWrapper>
  );
}

const tripStyles = StyleSheet.create({
  titleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12,
  },
  title: { fontFamily: ledgerFonts.display, fontSize: 20, color: ledgerColors.text.primary, letterSpacing: -0.3 },
  card: {
    backgroundColor: ledgerColors.surface,
    borderRadius: ledgerRadius.card,
    padding: 16,
    ...ledgerShadow.card,
  },
  stat: { flex: 1, alignItems: 'center', gap: 4 },
  statLabel: { fontSize: 10, fontWeight: '600', color: ledgerColors.text.secondary, textTransform: 'uppercase', letterSpacing: 0.6 },
  statValue: { fontFamily: ledgerFonts.display, fontSize: 20, color: ledgerColors.text.primary, fontVariant: ['tabular-nums'] },
  statDivider: { width: 1, height: 34, backgroundColor: ledgerColors.border },
  hairline: { height: 1, backgroundColor: ledgerColors.border, marginVertical: 12 },
  settleBtn: {
    flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 13, borderRadius: ledgerRadius.md,
    backgroundColor: ledgerColors.primary.default,
  },
  inviteCircle: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: ledgerColors.primary.default,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: ledgerColors.primary.subtle,
  },
  expenseRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  iconTile: {
    width: 36, height: 36, borderRadius: ledgerRadius.sm,
    backgroundColor: ledgerColors.primary.subtle, alignItems: 'center', justifyContent: 'center',
  },
  expTitle: { fontSize: 14.5, fontWeight: '500', color: ledgerColors.text.primary },
  expMeta: { fontSize: 12, color: ledgerColors.text.secondary, marginTop: 2 },
  expAmount: { fontFamily: ledgerFonts.displaySemibold, fontSize: 15, color: ledgerColors.text.primary, fontVariant: ['tabular-nums'] },
  sectionTitle: { fontFamily: ledgerFonts.display, fontSize: 18, color: ledgerColors.text.primary, letterSpacing: -0.3 },
});
