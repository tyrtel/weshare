import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { View, FlatList, Pressable, RefreshControl, StyleSheet, Share } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ScreenWrapper } from '../../../components/ui/ScreenWrapper';
import { TripDetailSkeleton } from '../../../components/skeletons/TripDetailSkeleton';
import { Text } from '../../../components/ui/Text';
import { ParticipantsRow } from '../../../components/ui/ParticipantsRow';
import { DetailHeaderBar } from '../../../components/ui/DetailHeaderBar';
import { DetailExpenseRow } from '../../../components/ui/DetailExpenseRow';
import { Feather } from '@expo/vector-icons';
import { TripFAB } from '../components/TripFAB';
import { BalanceViewSelector } from '../../../components/ui/BalanceViewSelector';
import { useBalanceView } from '../../../core/hooks/useBalanceView';
import { useTripDetail } from '../hooks/useTripDetail';
import { useService, useTripSessionStore } from '../../../core/di/ServiceContext';
import { AUTH, TRIP_STORE } from '../../../core/di/tokens';
import { useColors } from '../../../theme/colors';
import type { ColorPalette } from '../../../theme/colors';
import { ledgerRadius, ledgerShadow, ledgerFonts } from '../../../theme/tokens';
import { formatCurrency } from '../../../core/utils/formatCurrency';
import { computeMemberNetBalances } from '../../../core/logic/settlement';
import type { LedgerPayment } from '../../../core/logic/settlement';
import { toBalancesRecord, toBalanceBarMembers } from '../../../core/utils/balanceView';
import { selectSplitRequests } from '../../../store/selectors';
import type { Expense } from '../../../core/models/Expense';

export function TripDetailScreen() {
  const { t }  = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const auth   = useService(AUTH);
  const storeApi = useService(TRIP_STORE);
  const colors = useColors();
  const tripStyles = useMemo(() => makeTripStyles(colors), [colors]);
  const { trip: tripBalanceView, setTrip: setTripBalanceView } = useBalanceView();
  const { trip, expenses, loading, error, refetch } = useTripDetail(id);
  const [refreshing, setRefreshing] = useState(false);

  // The ledger's credit side — loaded alongside the trip so the stat card's
  // "YOUR NET" reflects completed payments, not just raw expense debits.
  useEffect(() => { void storeApi.getState().loadSplitRequests(id); }, [id, storeApi]);
  const splitRequests = useTripSessionStore((s) => selectSplitRequests(s, id));
  const completedPayments = useMemo<LedgerPayment[]>(
    () => splitRequests
      .filter(r => r.status === 'paid' || r.status === 'completed')
      .map(r => ({
        payerUserId: r.payerUserId,
        payeeUserId: r.requesterUserId,
        amountCents: r.amountCents,
        currency:    r.currency,
      })),
    [splitRequests],
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleAddExpense   = () => { router.push(`/expense/add?tripId=${id}`); };
  const handleExpensePress = (expense: Expense) => { router.push(`/expense/${expense.id}`); };

  const handleSettleUp = useCallback(() => {
    if (!trip) return;
    router.push(`/settle/${trip.id}`);
  }, [trip, router]);

  if (loading && !trip) {
    return <ScreenWrapper isLoading skeleton={<TripDetailSkeleton />} />;
  }

  if (error || !trip) {
    return (
      <ScreenWrapper>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <Text variant="body" color={colors.error.default} style={{ textAlign: 'center' }}>
            {error?.kind === 'NotFoundError' ? t('trips.detail.error_not_found') : t('trips.detail.error_load')}
          </Text>
        </View>
      </ScreenWrapper>
    );
  }

  const total   = expenses.reduce((s, e) => s + e.totalAmountCents, 0);
  const perHead = trip.members.length > 0 ? Math.round(total / trip.members.length) : 0;

  const memberBalancesList = computeMemberNetBalances(trip.members, expenses, completedPayments);
  const currentUserId = auth.currentUser()?.id ?? '';
  const myBalance = memberBalancesList.find(b => b.userId === currentUserId)?.balanceCents ?? 0;

  const balancesRecord = toBalancesRecord(memberBalancesList);
  const membersForBars = toBalanceBarMembers(trip.members);

  const handleInvite = () => Share.share({ message: `Join "${trip.name}" on WeShare` });

  return (
    <ScreenWrapper>
      <Stack.Screen options={{ headerShown: false }} />
      <DetailHeaderBar
        title={`${trip.emoji ?? '✈️'}  ${trip.name}`}
        onBack={() => router.back()}
        actionIcon="edit-2"
        actionIconSize={18}
        onAction={() => router.push(`/trip/edit?id=${trip.id}` as Parameters<typeof router.push>[0])}
      />

      <FlatList
        data={expenses}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <DetailExpenseRow
            description={item.description}
            payerName={trip.members.find(m => m.userId === item.paidByUserId)?.displayName ?? t('common.unknown_user')}
            amountCents={item.totalAmountCents}
            currency={trip.currency}
            metaSuffix={item.splitMode ?? 'equal'}
            onPress={() => handleExpensePress(item)}
          />
        )}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 80 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary.default}
            colors={[colors.primary.default]}
          />
        }
        ListHeaderComponent={
          <View style={{ backgroundColor: colors.background }}>
            {/* Stat strip */}
            <View style={[tripStyles.card, { marginBottom: 20, marginTop: 8 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={tripStyles.stat}>
                  <Text style={tripStyles.statLabel}>{t('trips.detail.stat_trip_total')}</Text>
                  <Text style={tripStyles.statValue}>{formatCurrency(total, trip.currency)}</Text>
                </View>
                <View style={tripStyles.statDivider} />
                <View style={tripStyles.stat}>
                  <Text style={tripStyles.statLabel}>{t('trips.detail.stat_per_person')}</Text>
                  <Text style={tripStyles.statValue}>{formatCurrency(perHead, trip.currency)}</Text>
                </View>
                <View style={tripStyles.statDivider} />
                <View style={tripStyles.stat}>
                  <Text style={tripStyles.statLabel}>{t('trips.detail.stat_your_net')}</Text>
                  <Text style={[tripStyles.statValue, { color: myBalance >= 0 ? colors.success.default : colors.error.default }]}>
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
                  <Feather name="check-circle" size={16} color={colors.text.inverse} />
                  <Text style={{ color: colors.text.inverse, fontWeight: '600', fontSize: 15 }}>{t('trips.detail.settle_trip_button')}</Text>
                </Pressable>
              )}
            </View>

            {/* Participants row */}
            <ParticipantsRow members={trip.members} onInvitePress={handleInvite} inviteLabel={t('trips.detail.invite_label')} />

            {/* Expenses header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
              <Text style={tripStyles.sectionTitle}>{t('trips.detail.expenses_section')}</Text>
              {trip.status !== 'closed' && (
                <Pressable onPress={handleAddExpense} hitSlop={8}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primary.default }}>{t('trips.detail.add_action')}</Text>
                </Pressable>
              )}
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={{ padding: 24, alignItems: 'center' }}>
            <Text style={{ color: colors.text.tertiary, fontSize: 13 }}>{t('trips.detail.empty_expenses_short')}</Text>
          </View>
        }
      />

      {trip.status !== 'closed' && (
        <TripFAB
          isExtended={expenses.length === 0}
          onAddExpense={handleAddExpense}
        />
      )}
    </ScreenWrapper>
  );
}

const makeTripStyles = (colors: ColorPalette) => StyleSheet.create({
  card:        { backgroundColor: colors.surface, borderRadius: ledgerRadius.card, padding: 16, ...ledgerShadow.card },
  stat:        { flex: 1, alignItems: 'center', gap: 4 },
  statLabel:   { fontSize: 10, fontWeight: '600', color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 0.6 },
  statValue:   { fontFamily: ledgerFonts.display, fontSize: 20, color: colors.text.primary, fontVariant: ['tabular-nums'] },
  statDivider: { width: 1, height: 34, backgroundColor: colors.border },
  hairline:    { height: 1, backgroundColor: colors.border, marginVertical: 12 },
  settleBtn: {
    flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 13, borderRadius: ledgerRadius.md,
    backgroundColor: colors.primary.default,
  },
  sectionTitle: { fontFamily: ledgerFonts.display, fontSize: 18, color: colors.text.primary, letterSpacing: -0.3 },
});
