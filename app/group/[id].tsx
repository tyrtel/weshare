import React, { useState, useEffect, useMemo } from 'react';
import { View, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withDelay, interpolate } from 'react-native-reanimated';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons, Feather } from '@expo/vector-icons';
import { Text } from '../../src/components/ui/Text';
import { ParticipantsRow, DetailHeaderBar, DetailExpenseRow, BalancePill } from '../../src/components/ui';
import { ClosedTripCard } from '../../src/features/trips/components/ClosedTripCard';
import { GroupExpenseCard } from '../../src/features/groups/components/GroupExpenseCard';
import { SendInviteSheet } from '../../src/features/groups/components/SendInviteSheet';
import { useGroupDetail } from '../../src/features/groups/hooks/useGroupDetail';
import { useSendGroupInvite } from '../../src/features/groups/hooks/useSendGroupInvite';
import { BalanceViewSelector } from '../../src/components/ui/BalanceViewSelector';
import { useBalanceView } from '../../src/core/hooks/useBalanceView';
import { useService } from '../../src/core/di/ServiceContext';
import { AUTH } from '../../src/core/di/tokens';
import { useColors } from '../../src/theme/colors';
import { tokens, ledgerRadius, ledgerShadow, ledgerFonts } from '../../src/theme/tokens';
import { toBalancesRecord, toBalanceBarMembers } from '../../src/core/utils/balanceView';
import { formatCurrency } from '../../src/core/utils/formatCurrency';
import { deriveTripFinancialSummary } from '../../src/core/logic/settlement';
import { confirm } from '../../src/core/utils/confirm';
import type { Trip } from '../../src/core/models/Trip';
import type { Expense } from '../../src/core/models/Expense';
import type { GroupMember } from '../../src/core/models/GroupMember';

const FAB_SIZE   = 56;
const FAB_SPRING = { damping: 18, stiffness: 220 } as const;

export default function GroupDetailScreen() {
  const { t }  = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const auth   = useService(AUTH);
  const colors = useColors();
  const lgStyles = useMemo(() => StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: ledgerRadius.card,
      padding: 16,
      marginBottom: 0,
      ...ledgerShadow.card,
    },
    cardLabel: {
      fontSize: 12, fontWeight: '600', color: colors.text.secondary,
      textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8,
    },
    hairline: { height: 1, backgroundColor: colors.border, marginVertical: 12 },
    primaryBtn: {
      flex: 1, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center',
      paddingVertical: 13, borderRadius: ledgerRadius.md,
      backgroundColor: colors.primary.default,
    },
    sectionRow: {
      flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
      marginTop: 24, marginBottom: 12,
    },
    sectionTitle:  { fontFamily: ledgerFonts.display, fontSize: 18, color: colors.text.primary, letterSpacing: -0.3 },
    sectionAction: { fontSize: 13, fontWeight: '600', color: colors.primary.default },
    rowDivider:    { height: 1, backgroundColor: colors.border, marginLeft: 48 },
    expTitle:      { fontSize: 14.5, fontWeight: '500', color: colors.text.primary },
  }), [colors]);

  const {
    group,
    activeTrips,
    closedTrips,
    tripExpenses,
    activeExpenses,
    closedExpenses,
    settlements,
    memberBalances,
    completedPayments,
    archivableExpenseIds,
    archivableTripIds,
    closeExpense,
    closeTrip,
  } = useGroupDetail(id);
  const { sendInvite, sending } = useSendGroupInvite();

  const [fabOpen, setFabOpen] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const [showClosedExpenses, setShowClosedExpenses] = useState(false);
  const [inviteTarget, setInviteTarget] = useState<GroupMember | null>(null);

  const fabRotation = useSharedValue(0);
  const item0 = useSharedValue(0);
  const item1 = useSharedValue(0);
  const item2 = useSharedValue(0);
  const item3 = useSharedValue(0);

  useEffect(() => {
    fabRotation.value = withSpring(fabOpen ? 45 : 0, { damping: 15, stiffness: 200 });
    if (fabOpen) {
      item3.value = withSpring(1, FAB_SPRING);
      item2.value = withDelay(55,  withSpring(1, FAB_SPRING));
      item1.value = withDelay(110, withSpring(1, FAB_SPRING));
      item0.value = withDelay(165, withSpring(1, FAB_SPRING));
    } else {
      item0.value = withSpring(0, FAB_SPRING);
      item1.value = withDelay(55,  withSpring(0, FAB_SPRING));
      item2.value = withDelay(110, withSpring(0, FAB_SPRING));
      item3.value = withDelay(165, withSpring(0, FAB_SPRING));
    }
  }, [fabOpen, fabRotation, item0, item1, item2, item3]);

  const fabIconStyle  = useAnimatedStyle(() => ({ transform: [{ rotate: `${fabRotation.value}deg` }] }));
  const fabItem0Style = useAnimatedStyle(() => ({ opacity: item0.value, transform: [{ translateY: interpolate(item0.value, [0, 1], [20, 0]) }] }));
  const fabItem1Style = useAnimatedStyle(() => ({ opacity: item1.value, transform: [{ translateY: interpolate(item1.value, [0, 1], [20, 0]) }] }));
  const fabItem2Style = useAnimatedStyle(() => ({ opacity: item2.value, transform: [{ translateY: interpolate(item2.value, [0, 1], [20, 0]) }] }));
  const fabItem3Style = useAnimatedStyle(() => ({ opacity: item3.value, transform: [{ translateY: interpolate(item3.value, [0, 1], [20, 0]) }] }));

  // Doesn't depend on `group` — must stay above the early return below so this
  // hook is called unconditionally on every render (Rules of Hooks).
  const { group: groupBalanceView, setGroup: setGroupBalanceView } = useBalanceView();

  if (!group) return null;

  const currentUserId = auth.currentUser()?.id;
  const isOwner = currentUserId === group.ownerId;

  // Per-trip standing from the current user's perspective — mirrors what the
  // home screen's trip cards show, so a trip row here reads the same way.
  const tripSummaries: Record<string, ReturnType<typeof deriveTripFinancialSummary>> = {};
  for (const trip of activeTrips) {
    tripSummaries[trip.id] = currentUserId
      ? deriveTripFinancialSummary(trip.members, tripExpenses[trip.id] ?? [], currentUserId)
      : null;
  }

  const handleTripPress  = (trip: Trip)    => router.push(`/trip/${trip.id}` as Parameters<typeof router.push>[0]);
  const handleNewTrip    = () => { setFabOpen(false); router.push(`/trip/create?groupId=${group.id}` as Parameters<typeof router.push>[0]); };
  const handleNewExpense = () => { setFabOpen(false); router.push(`/group/expense/add?groupId=${group.id}` as Parameters<typeof router.push>[0]); };
  const handleNewRecurring = () => { setFabOpen(false); router.push(`/group/expense/add?groupId=${group.id}&recurring=true` as Parameters<typeof router.push>[0]); };
  const handleAddMember  = () => { setFabOpen(false); router.push(`/group/add-member?groupId=${group.id}` as Parameters<typeof router.push>[0]); };
  const handleExpensePress = (expense: Expense) => router.push(`/group/expense/${expense.id}?groupId=${group.id}` as Parameters<typeof router.push>[0]);

  const handleArchiveExpense = (expense: Expense) => {
    void confirm(
      t('expenses.detail.close_alert_title'),
      t('expenses.detail.close_alert_message'),
      t('expenses.detail.close_alert_confirm'),
    ).then(async confirmed => {
      if (confirmed) await closeExpense(expense);
    });
  };

  const handleArchiveTrip = (trip: Trip) => {
    void confirm(
      t('groups.detail.close_trip_alert_title'),
      t('groups.detail.close_trip_alert_message'),
      t('groups.detail.close_trip_alert_confirm'),
    ).then(async confirmed => {
      if (confirmed) await closeTrip(trip);
    });
  };

  const balancesRecord = toBalancesRecord(memberBalances);
  const membersForBars = toBalanceBarMembers(group.members);
  const memberMap = new Map(group.members.map(m => [m.userId, m]));

  const recentPayments = [...completedPayments]
    .sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0))
    .slice(0, 3);

  const handlePaymentPress = (payment: (typeof recentPayments)[number]) => {
    const fromName = memberMap.get(payment.payerUserId)?.displayName ?? t('common.unknown_user');
    const toName   = memberMap.get(payment.payeeUserId)?.displayName ?? t('common.unknown_user');
    router.push({
      pathname: `/group/settle/audit/${group.id}` as never,
      params: { groupId: group.id, fromUserId: payment.payerUserId, toUserId: payment.payeeUserId, fromName, toName },
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <DetailHeaderBar
        title={`👥  ${group.name}`}
        onBack={() => router.back()}
        actionIcon="edit-2"
        actionIconSize={20}
        onAction={() => router.push(`/group/edit?id=${group.id}` as Parameters<typeof router.push>[0])}
      />

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 80 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Balances card */}
        <View style={lgStyles.card}>
          <Text style={lgStyles.cardLabel}>{t('groups.detail.balances_label')}</Text>
          {memberBalances.some(b => b.balanceCents !== 0) ? (
            <BalanceViewSelector
              balances={balancesRecord}
              members={membersForBars}
              viewMode={groupBalanceView}
              onChangeView={setGroupBalanceView}
              currency={group.currency}
            />
          ) : (
            <Text style={{ color: colors.text.tertiary, fontSize: 13, paddingVertical: 8 }}>
              {t('groups.card.all_settled')}
            </Text>
          )}
          <View style={lgStyles.hairline} />
          <Pressable
            onPress={() => router.push(`/group/settle/${group.id}` as Parameters<typeof router.push>[0])}
            style={({ pressed }) => [lgStyles.primaryBtn, { opacity: pressed ? 0.85 : 1 }]}
          >
            <Feather name="check-circle" size={16} color={colors.text.inverse} />
            <Text style={{ color: colors.text.inverse, fontWeight: '600', fontSize: 15 }}>
              {t(settlements.length > 0 ? 'groups.detail.settle_up' : 'groups.detail.view_settlement')}
            </Text>
          </Pressable>
          <Text style={{ color: colors.text.tertiary, fontSize: 11.5, textAlign: 'center', marginTop: 8 }}>
            {t(settlements.length > 0 ? 'groups.detail.settle_up_hint' : 'groups.detail.view_settlement_hint')}
          </Text>
        </View>

        {/* Recent payments */}
        {recentPayments.length > 0 && (
          <>
            <View style={lgStyles.sectionRow}>
              <Text style={lgStyles.sectionTitle}>{t('groups.detail.payments_section')}</Text>
            </View>
            <View style={lgStyles.card}>
              {recentPayments.map((payment, i) => {
                const fromName = memberMap.get(payment.payerUserId)?.displayName ?? t('common.unknown_user');
                const toName   = memberMap.get(payment.payeeUserId)?.displayName ?? t('common.unknown_user');
                return (
                  <View key={payment.id ?? i}>
                    {i > 0 && <View style={lgStyles.rowDivider} />}
                    <Pressable
                      onPress={() => handlePaymentPress(payment)}
                      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, opacity: pressed ? 0.7 : 1 }]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={lgStyles.expTitle}>{t('groups.detail.payment_row', { from: fromName, to: toName })}</Text>
                        {payment.date && (
                          <Text style={{ color: colors.text.tertiary, fontSize: 12, marginTop: 2 }}>
                            {payment.date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                          </Text>
                        )}
                      </View>
                      <Text style={{ fontWeight: '600', fontSize: 14.5, color: colors.text.primary }}>
                        {formatCurrency(payment.amountCents, payment.currency)}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* Members */}
        <View style={lgStyles.sectionRow}>
          <Text style={lgStyles.sectionTitle}>{t('groups.detail.members_section')}</Text>
        </View>
        <ParticipantsRow
          members={group.members}
          onInvitePress={handleAddMember}
          inviteLabel={t('groups.detail.invite_label')}
          onMemberPress={isOwner ? (m) => setInviteTarget(m as GroupMember) : undefined}
          unlinkedLabel={t('groups.detail.unlinked_label')}
        />

        {/* Active trips */}
        {activeTrips.length > 0 && (
          <>
            <View style={lgStyles.sectionRow}>
              <Text style={lgStyles.sectionTitle}>{t('groups.detail.trips_section')}</Text>
              <Pressable onPress={handleNewTrip} hitSlop={8}>
                <Text style={lgStyles.sectionAction}>{t('groups.detail.fab_new_trip')}</Text>
              </Pressable>
            </View>
            {activeTrips.map(trip => {
              const summary = tripSummaries[trip.id];
              const pillCents = summary?.direction === 'owed' ? summary.amountCents
                : summary?.direction === 'owe' ? -summary.amountCents : 0;
              return (
                <View key={trip.id} style={[lgStyles.card, { flexDirection: 'row', alignItems: 'center', marginBottom: 12 }]}>
                  <Pressable
                    onPress={() => handleTripPress(trip)}
                    style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.85 : 1 })}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={lgStyles.expTitle} numberOfLines={1}>✈️{'  '}{trip.name}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        {summary && <BalancePill cents={pillCents} currency={trip.currency} />}
                        <Feather name="chevron-right" size={18} color={colors.text.tertiary} />
                      </View>
                    </View>
                  </Pressable>
                  {archivableTripIds.has(trip.id) && (
                    <Pressable
                      onPress={() => handleArchiveTrip(trip)}
                      accessibilityRole="button"
                      accessibilityLabel={t('groups.detail.archive_ready_accessibility')}
                      hitSlop={8}
                      style={({ pressed }) => ({ marginLeft: 8, padding: 4, opacity: pressed ? 0.7 : 1 })}
                    >
                      <Feather name="check-circle" size={20} color={colors.success.default} />
                    </Pressable>
                  )}
                </View>
              );
            })}
          </>
        )}

        {/* Past (closed) trips — organizational only; still fully part of the
            group ledger above, this is just where to go find and reopen one. */}
        {closedTrips.length > 0 && (
          <>
            <Pressable
              onPress={() => setShowPast(p => !p)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                marginTop: activeTrips.length > 0 ? 12 : 24,
                padding: tokens.spacing.md,
                borderRadius: tokens.radius.card,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Ionicons name="archive-outline" size={18} color={colors.primary.default} />
              <Text style={[lgStyles.sectionAction, { flex: 1, marginLeft: tokens.spacing.sm }]}>
                {t(showPast ? 'groups.detail.hide_past' : 'groups.detail.view_past')}
              </Text>
              <Ionicons name={showPast ? 'chevron-up' : 'chevron-down'} size={18} color={colors.text.tertiary} />
            </Pressable>
            {showPast && (
              <>
                <View style={lgStyles.sectionRow}>
                  <Text style={lgStyles.sectionTitle}>{t('groups.detail.past_section')}</Text>
                </View>
                {closedTrips.map(trip => (
                  <ClosedTripCard key={trip.id} trip={trip} expenseCount={tripExpenses[trip.id]?.length ?? 0} />
                ))}
              </>
            )}
          </>
        )}

        {/* Expenses */}
        {activeExpenses.length > 0 && (
          <>
            <View style={lgStyles.sectionRow}>
              <Text style={lgStyles.sectionTitle}>{t('groups.detail.expenses_section')}</Text>
              <Pressable onPress={handleNewExpense} hitSlop={8}>
                <Text style={lgStyles.sectionAction}>{t('groups.detail.add_action')}</Text>
              </Pressable>
            </View>
            <View style={lgStyles.card}>
              {activeExpenses.map((expense, i) => {
                const payer = group.members.find(m => m.userId === expense.paidByUserId);
                return (
                  <View key={expense.id}>
                    {i > 0 && <View style={lgStyles.rowDivider} />}
                    <DetailExpenseRow
                      description={expense.description}
                      payerName={payer ? payer.displayName : t('common.unknown_user')}
                      amountCents={expense.totalAmountCents}
                      currency={group.currency}
                      onArchivePress={archivableExpenseIds.has(expense.id) ? () => handleArchiveExpense(expense) : undefined}
                      archiveAccessibilityLabel={t('groups.detail.archive_ready_accessibility')}
                      onPress={() => handleExpensePress(expense)}
                    />
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* Closed expenses — organizational only, like closed trips; still
            fully part of the group ledger above, this is just where to go
            find and reopen one. */}
        {closedExpenses.length > 0 && (
          <>
            <Pressable
              onPress={() => setShowClosedExpenses(p => !p)}
              hitSlop={8}
              style={{ marginTop: activeExpenses.length > 0 ? 12 : 24 }}
            >
              <Text style={lgStyles.sectionAction}>
                {t(showClosedExpenses ? 'groups.detail.hide_closed_expenses' : 'groups.detail.view_closed_expenses')}
              </Text>
            </Pressable>
            {showClosedExpenses && closedExpenses.map(expense => {
              const payer = group.members.find(m => m.userId === expense.paidByUserId);
              return (
                <GroupExpenseCard
                  key={expense.id}
                  expense={expense}
                  payerName={payer ? payer.displayName : t('common.unknown_user')}
                  onPress={handleExpensePress}
                />
              );
            })}
          </>
        )}
      </ScrollView>

      {inviteTarget && (
        <SendInviteSheet
          visible
          memberName={inviteTarget.displayName}
          defaultEmail={inviteTarget.email}
          busy={sending}
          onClose={() => setInviteTarget(null)}
          onConfirm={(email) => {
            void sendInvite(group, inviteTarget, email).then(() => setInviteTarget(null));
          }}
        />
      )}

      {/* FAB speed-dial */}
      <View style={{ position: 'absolute', bottom: tokens.spacing.xl, right: tokens.spacing.md, alignItems: 'flex-end', zIndex: 20 }}>
        <View style={{ marginBottom: tokens.spacing.sm, alignItems: 'flex-end', gap: tokens.spacing.sm }}>
          <Animated.View style={fabItem0Style} pointerEvents={fabOpen ? 'auto' : 'none'}>
            <Pressable
              onPress={handleNewTrip}
              accessibilityRole="button"
              accessibilityLabel={t('groups.detail.fab_new_trip')}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center',
                backgroundColor: colors.surface, borderRadius: tokens.radius.pill,
                paddingHorizontal: tokens.spacing.md, paddingVertical: tokens.spacing.sm,
                ...tokens.shadow.md, opacity: pressed ? 0.8 : 1, gap: tokens.spacing.xs,
              })}
            >
              <Ionicons name="airplane-outline" size={18} color={colors.primary.default} />
              <Text variant="label" color={colors.primary.default}>{t('groups.detail.fab_new_trip')}</Text>
            </Pressable>
          </Animated.View>

          <Animated.View style={fabItem1Style} pointerEvents={fabOpen ? 'auto' : 'none'}>
            <Pressable
              onPress={handleNewExpense}
              accessibilityRole="button"
              accessibilityLabel={t('groups.detail.fab_new_expense')}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center',
                backgroundColor: colors.surface, borderRadius: tokens.radius.pill,
                paddingHorizontal: tokens.spacing.md, paddingVertical: tokens.spacing.sm,
                ...tokens.shadow.md, opacity: pressed ? 0.8 : 1, gap: tokens.spacing.xs,
              })}
            >
              <Ionicons name="receipt-outline" size={18} color={colors.primary.default} />
              <Text variant="label" color={colors.primary.default}>{t('groups.detail.fab_new_expense')}</Text>
            </Pressable>
          </Animated.View>

          <Animated.View style={fabItem2Style} pointerEvents={fabOpen ? 'auto' : 'none'}>
            <Pressable
              onPress={handleNewRecurring}
              accessibilityRole="button"
              accessibilityLabel={t('groups.detail.fab_new_recurring')}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center',
                backgroundColor: colors.surface, borderRadius: tokens.radius.pill,
                paddingHorizontal: tokens.spacing.md, paddingVertical: tokens.spacing.sm,
                ...tokens.shadow.md, opacity: pressed ? 0.8 : 1, gap: tokens.spacing.xs,
              })}
            >
              <Ionicons name="repeat-outline" size={18} color={colors.primary.default} />
              <Text variant="label" color={colors.primary.default}>{t('groups.detail.fab_new_recurring')}</Text>
            </Pressable>
          </Animated.View>

          <Animated.View style={fabItem3Style} pointerEvents={fabOpen ? 'auto' : 'none'}>
            <Pressable
              onPress={handleAddMember}
              accessibilityRole="button"
              accessibilityLabel={t('groups.detail.fab_add_member')}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center',
                backgroundColor: colors.surface, borderRadius: tokens.radius.pill,
                paddingHorizontal: tokens.spacing.md, paddingVertical: tokens.spacing.sm,
                ...tokens.shadow.md, opacity: pressed ? 0.8 : 1, gap: tokens.spacing.xs,
              })}
            >
              <Ionicons name="person-add-outline" size={18} color={colors.primary.default} />
              <Text variant="label" color={colors.primary.default}>{t('groups.detail.fab_add_member')}</Text>
            </Pressable>
          </Animated.View>
        </View>

        <Pressable
          onPress={() => setFabOpen(o => !o)}
          accessibilityRole="button"
          accessibilityLabel={t('groups.detail.open_actions_accessibility')}
          style={({ pressed }) => ({
            width: FAB_SIZE, height: FAB_SIZE, borderRadius: FAB_SIZE / 2,
            backgroundColor: colors.primary.default,
            alignItems: 'center', justifyContent: 'center',
            opacity: pressed ? 0.8 : 1, ...tokens.shadow.lg,
          })}
        >
          <Animated.View style={fabIconStyle}>
            <Ionicons name="add" size={24} color={colors.text.inverse} />
          </Animated.View>
        </Pressable>
      </View>
    </View>
  );
}
