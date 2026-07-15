import React, { useState, useEffect } from 'react';
import { View, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withDelay, interpolate } from 'react-native-reanimated';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons, Feather } from '@expo/vector-icons';
import { Text } from '../../src/components/ui/Text';
import { ParticipantsRow, DetailHeaderBar, DetailExpenseRow } from '../../src/components/ui';
import { ClosedTripCard } from '../../src/features/trips/components/ClosedTripCard';
import { SendInviteSheet } from '../../src/features/groups/components/SendInviteSheet';
import { useGroupDetail } from '../../src/features/groups/hooks/useGroupDetail';
import { useSendGroupInvite } from '../../src/features/groups/hooks/useSendGroupInvite';
import { BalanceViewSelector } from '../../src/components/ui/BalanceViewSelector';
import { useBalanceView } from '../../src/core/hooks/useBalanceView';
import { useService } from '../../src/core/di/ServiceContext';
import { AUTH } from '../../src/core/di/tokens';
import { ledgerColors } from '../../src/theme/colors';
import { tokens, ledgerRadius, ledgerShadow, ledgerFonts } from '../../src/theme/tokens';
import { toBalancesRecord, toBalanceBarMembers } from '../../src/core/utils/balanceView';
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

  const {
    group,
    activeTrips,
    closedTrips,
    tripExpenses,
    groupExpenses,
    settlements,
    memberBalances,
  } = useGroupDetail(id);
  const { sendInvite, sending } = useSendGroupInvite();

  const [fabOpen, setFabOpen] = useState(false);
  const [showPast, setShowPast] = useState(false);
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

  const isOwner = auth.currentUser()?.id === group.ownerId;

  const handleTripPress  = (trip: Trip)    => router.push(`/trip/${trip.id}` as Parameters<typeof router.push>[0]);
  const handleNewTrip    = () => { setFabOpen(false); router.push(`/trip/create?groupId=${group.id}` as Parameters<typeof router.push>[0]); };
  const handleNewExpense = () => { setFabOpen(false); router.push(`/group/expense/add?groupId=${group.id}` as Parameters<typeof router.push>[0]); };
  const handleNewRecurring = () => { setFabOpen(false); router.push(`/group/expense/add?groupId=${group.id}&recurring=true` as Parameters<typeof router.push>[0]); };
  const handleAddMember  = () => { setFabOpen(false); router.push(`/group/add-member?groupId=${group.id}` as Parameters<typeof router.push>[0]); };
  const handleExpensePress = (expense: Expense) => router.push(`/group/expense/${expense.id}?groupId=${group.id}` as Parameters<typeof router.push>[0]);

  const balancesRecord = toBalancesRecord(memberBalances);
  const membersForBars = toBalanceBarMembers(group.members);

  return (
    <View style={{ flex: 1, backgroundColor: ledgerColors.background }}>
      <DetailHeaderBar
        title={`${group.emoji ?? '👥'}  ${group.name}`}
        onBack={() => router.back()}
        actionIcon="settings"
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
            <Text style={{ color: ledgerColors.text.tertiary, fontSize: 13, paddingVertical: 8 }}>
              {t('groups.card.all_settled')}
            </Text>
          )}
          <View style={lgStyles.hairline} />
          {settlements.length > 0 && (
            <Pressable
              onPress={() => router.push(`/group/settle/${group.id}` as Parameters<typeof router.push>[0])}
              style={({ pressed }) => [lgStyles.primaryBtn, { opacity: pressed ? 0.85 : 1 }]}
            >
              <Feather name="check-circle" size={16} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>{t('groups.detail.settle_up')}</Text>
            </Pressable>
          )}
        </View>

        {/* Active trips */}
        {activeTrips.length > 0 && (
          <>
            <View style={lgStyles.sectionRow}>
              <Text style={lgStyles.sectionTitle}>{t('groups.detail.trips_section')}</Text>
              <Pressable onPress={handleNewTrip} hitSlop={8}>
                <Text style={lgStyles.sectionAction}>{t('groups.detail.fab_new_trip')}</Text>
              </Pressable>
            </View>
            {activeTrips.map(trip => (
              <Pressable
                key={trip.id}
                onPress={() => handleTripPress(trip)}
                style={({ pressed }) => [lgStyles.card, { opacity: pressed ? 0.85 : 1, marginBottom: 12 }]}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={lgStyles.expTitle}>{trip.emoji ?? '✈️'}{'  '}{trip.name}</Text>
                  <Feather name="chevron-right" size={18} color={ledgerColors.text.tertiary} />
                </View>
              </Pressable>
            ))}
          </>
        )}

        {/* Past (closed) trips — organizational only; still fully part of the
            group ledger above, this is just where to go find and reopen one. */}
        {closedTrips.length > 0 && (
          <>
            <Pressable
              onPress={() => setShowPast(p => !p)}
              hitSlop={8}
              style={{ marginTop: activeTrips.length > 0 ? 12 : 24 }}
            >
              <Text style={lgStyles.sectionAction}>
                {t(showPast ? 'groups.detail.hide_past' : 'groups.detail.view_past')}
              </Text>
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
        {groupExpenses.length > 0 && (
          <>
            <View style={lgStyles.sectionRow}>
              <Text style={lgStyles.sectionTitle}>{t('groups.detail.expenses_section')}</Text>
              <Pressable onPress={handleNewExpense} hitSlop={8}>
                <Text style={lgStyles.sectionAction}>{t('groups.detail.add_action')}</Text>
              </Pressable>
            </View>
            <View style={lgStyles.card}>
              {groupExpenses.map((expense, i) => {
                const payer = group.members.find(m => m.userId === expense.paidByUserId);
                return (
                  <View key={expense.id}>
                    {i > 0 && <View style={lgStyles.rowDivider} />}
                    <DetailExpenseRow
                      description={expense.description}
                      payerName={payer ? payer.displayName : t('common.unknown_user')}
                      amountCents={expense.totalAmountCents}
                      currency={group.currency}
                      onPress={() => handleExpensePress(expense)}
                    />
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* Members section */}
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
                backgroundColor: ledgerColors.surface, borderRadius: tokens.radius.pill,
                paddingHorizontal: tokens.spacing.md, paddingVertical: tokens.spacing.sm,
                ...tokens.shadow.md, opacity: pressed ? 0.8 : 1, gap: tokens.spacing.xs,
              })}
            >
              <Ionicons name="airplane-outline" size={18} color={ledgerColors.primary.default} />
              <Text variant="label" color={ledgerColors.primary.default}>{t('groups.detail.fab_new_trip')}</Text>
            </Pressable>
          </Animated.View>

          <Animated.View style={fabItem1Style} pointerEvents={fabOpen ? 'auto' : 'none'}>
            <Pressable
              onPress={handleNewExpense}
              accessibilityRole="button"
              accessibilityLabel={t('groups.detail.fab_new_expense')}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center',
                backgroundColor: ledgerColors.surface, borderRadius: tokens.radius.pill,
                paddingHorizontal: tokens.spacing.md, paddingVertical: tokens.spacing.sm,
                ...tokens.shadow.md, opacity: pressed ? 0.8 : 1, gap: tokens.spacing.xs,
              })}
            >
              <Ionicons name="receipt-outline" size={18} color={ledgerColors.primary.default} />
              <Text variant="label" color={ledgerColors.primary.default}>{t('groups.detail.fab_new_expense')}</Text>
            </Pressable>
          </Animated.View>

          <Animated.View style={fabItem2Style} pointerEvents={fabOpen ? 'auto' : 'none'}>
            <Pressable
              onPress={handleNewRecurring}
              accessibilityRole="button"
              accessibilityLabel={t('groups.detail.fab_new_recurring')}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center',
                backgroundColor: ledgerColors.surface, borderRadius: tokens.radius.pill,
                paddingHorizontal: tokens.spacing.md, paddingVertical: tokens.spacing.sm,
                ...tokens.shadow.md, opacity: pressed ? 0.8 : 1, gap: tokens.spacing.xs,
              })}
            >
              <Ionicons name="repeat-outline" size={18} color={ledgerColors.primary.default} />
              <Text variant="label" color={ledgerColors.primary.default}>{t('groups.detail.fab_new_recurring')}</Text>
            </Pressable>
          </Animated.View>

          <Animated.View style={fabItem3Style} pointerEvents={fabOpen ? 'auto' : 'none'}>
            <Pressable
              onPress={handleAddMember}
              accessibilityRole="button"
              accessibilityLabel={t('groups.detail.fab_add_member')}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center',
                backgroundColor: ledgerColors.surface, borderRadius: tokens.radius.pill,
                paddingHorizontal: tokens.spacing.md, paddingVertical: tokens.spacing.sm,
                ...tokens.shadow.md, opacity: pressed ? 0.8 : 1, gap: tokens.spacing.xs,
              })}
            >
              <Ionicons name="person-add-outline" size={18} color={ledgerColors.primary.default} />
              <Text variant="label" color={ledgerColors.primary.default}>{t('groups.detail.fab_add_member')}</Text>
            </Pressable>
          </Animated.View>
        </View>

        <Pressable
          onPress={() => setFabOpen(o => !o)}
          accessibilityRole="button"
          accessibilityLabel={t('groups.detail.open_actions_accessibility')}
          style={({ pressed }) => ({
            width: FAB_SIZE, height: FAB_SIZE, borderRadius: FAB_SIZE / 2,
            backgroundColor: ledgerColors.primary.default,
            alignItems: 'center', justifyContent: 'center',
            opacity: pressed ? 0.8 : 1, ...tokens.shadow.lg,
          })}
        >
          <Animated.View style={fabIconStyle}>
            <Ionicons name="add" size={24} color="#ffffff" />
          </Animated.View>
        </Pressable>
      </View>
    </View>
  );
}

const lgStyles = StyleSheet.create({
  card: {
    backgroundColor: ledgerColors.surface,
    borderRadius: ledgerRadius.card,
    padding: 16,
    marginBottom: 0,
    ...ledgerShadow.card,
  },
  cardLabel: {
    fontSize: 12, fontWeight: '600', color: ledgerColors.text.secondary,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8,
  },
  hairline: { height: 1, backgroundColor: ledgerColors.border, marginVertical: 12 },
  primaryBtn: {
    flex: 1, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 13, borderRadius: ledgerRadius.md,
    backgroundColor: ledgerColors.primary.default,
  },
  sectionRow: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
    marginTop: 24, marginBottom: 12,
  },
  sectionTitle:  { fontFamily: ledgerFonts.display, fontSize: 18, color: ledgerColors.text.primary, letterSpacing: -0.3 },
  sectionAction: { fontSize: 13, fontWeight: '600', color: ledgerColors.primary.default },
  rowDivider:    { height: 1, backgroundColor: ledgerColors.border, marginLeft: 48 },
  expTitle:      { fontSize: 14.5, fontWeight: '500', color: ledgerColors.text.primary },
});
