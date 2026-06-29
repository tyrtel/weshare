import React, { useState, useEffect } from 'react';
import { View, ScrollView, Pressable, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import Animated, { ZoomIn, FadeIn, useSharedValue, useAnimatedStyle, withSpring, withDelay, interpolate } from 'react-native-reanimated';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '../../src/components/ui/ScreenWrapper';
import { TAB_BAR_HEIGHT } from '../../src/components/ui/UniversalTabBar';
import { Text } from '../../src/components/ui/Text';
import { Avatar } from '../../src/components/ui';
import { TripCard } from '../../src/features/trips/components/TripCard';
import { GroupExpenseCard } from '../../src/features/groups/components/GroupExpenseCard';
import { useGroupDetail } from '../../src/features/groups/hooks/useGroupDetail';
import { useTripSessionStore } from '../../src/core/di/ServiceContext';
import { useColors } from '../../src/theme/colors';
import { personColors } from '../../src/theme/colors';
import { tokens } from '../../src/theme/tokens';
import { formatCurrency } from '../../src/core/utils/formatCurrency';
import type { Trip } from '../../src/core/models/Trip';
import type { Expense } from '../../src/core/models/Expense';

const FAB_SIZE   = 56;
const FAB_SPRING = { damping: 18, stiffness: 220 } as const;

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function SectionLabel({ title }: { title: string }) {
  const colors = useColors();
  return (
    <Text
      variant="label"
      color={colors.text.secondary}
      style={{ textTransform: 'uppercase', letterSpacing: 0.8, fontSize: 11, marginBottom: tokens.spacing.sm, marginTop: tokens.spacing.md }}
    >
      {title}
    </Text>
  );
}

export default function GroupDetailScreen() {
  const { t }  = useTranslation();
  const router = useRouter();
  const colors = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();

  const {
    group,
    activeTrips,
    closedTrips,
    activeGroupExpenses,
    settledGroupExpenses,
    settlements,
    memberBalances,
  } = useGroupDetail(id);

  const [showPast, setShowPast] = useState(false);
  const [fabOpen,  setFabOpen]  = useState(false);

  const fabRotation = useSharedValue(0);
  // One progress value per FAB item (0 = hidden, 1 = visible).
  // Ordered top-to-bottom in the UI: trip (0), expense (1), add-member (2).
  // On open: slide up bottom-first; on close: collapse top-first.
  const item0 = useSharedValue(0);
  const item1 = useSharedValue(0);
  const item2 = useSharedValue(0);

  useEffect(() => {
    fabRotation.value = withSpring(fabOpen ? 45 : 0, { damping: 15, stiffness: 200 });
    if (fabOpen) {
      item2.value = withSpring(1, FAB_SPRING);
      item1.value = withDelay(55, withSpring(1, FAB_SPRING));
      item0.value = withDelay(110, withSpring(1, FAB_SPRING));
    } else {
      item0.value = withSpring(0, FAB_SPRING);
      item1.value = withDelay(55, withSpring(0, FAB_SPRING));
      item2.value = withDelay(110, withSpring(0, FAB_SPRING));
    }
  }, [fabOpen, fabRotation, item0, item1, item2]);

  const fabIconStyle  = useAnimatedStyle(() => ({ transform: [{ rotate: `${fabRotation.value}deg` }] }));
  const fabItem0Style = useAnimatedStyle(() => ({
    opacity:   item0.value,
    transform: [{ translateY: interpolate(item0.value, [0, 1], [20, 0]) }],
  }));
  const fabItem1Style = useAnimatedStyle(() => ({
    opacity:   item1.value,
    transform: [{ translateY: interpolate(item1.value, [0, 1], [20, 0]) }],
  }));
  const fabItem2Style = useAnimatedStyle(() => ({
    opacity:   item2.value,
    transform: [{ translateY: interpolate(item2.value, [0, 1], [20, 0]) }],
  }));

  if (!group) return null;

  const handleTripPress = (trip: Trip) => router.push(`/trip/${trip.id}` as Parameters<typeof router.push>[0]);

  const handleNewTrip = () => {
    setFabOpen(false);
    router.push(`/trip/create?groupId=${group.id}` as Parameters<typeof router.push>[0]);
  };

  const handleNewExpense = () => {
    setFabOpen(false);
    router.push(`/group/expense/add?groupId=${group.id}` as Parameters<typeof router.push>[0]);
  };

  const handleAddMember = () => {
    setFabOpen(false);
    router.push(`/group/add-member?groupId=${group.id}` as Parameters<typeof router.push>[0]);
  };

  const handleExpensePress = (expense: Expense) => {
    router.push(`/group/expense/${expense.id}?groupId=${group.id}` as Parameters<typeof router.push>[0]);
  };

  const memberMap = new Map(group.members.map(m => [m.userId, m]));

  const hasActiveItems  = activeTrips.length > 0 || activeGroupExpenses.length > 0;
  const hasPastItems    = closedTrips.length > 0  || settledGroupExpenses.length > 0;

  const maxVisible = 5;
  const visible    = group.members.slice(0, maxVisible);
  const overflow   = group.members.length - visible.length;

  return (
    <ScreenWrapper>
      <Stack.Screen
        options={{
          title: group.name,
          headerRight: () => (
            <Pressable
              onPress={() => router.push(`/group/edit?id=${group.id}` as Parameters<typeof router.push>[0])}
              accessibilityRole="button"
              accessibilityLabel="Edit group"
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, marginRight: tokens.spacing.xs })}
            >
              <Ionicons name="settings-outline" size={20} color={colors.text.secondary} />
            </Pressable>
          ),
        }}
      />

      {fabOpen && (
        <Pressable
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 }}
          onPress={() => setFabOpen(false)}
        />
      )}

      {/* Member avatar row + settle-up — outside ScrollView so it stays above the FAB overlay (zIndex 20 > overlay zIndex 10) */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: tokens.spacing.md,
          paddingVertical: tokens.spacing.sm,
          borderBottomWidth: 1,
          borderBottomColor: colors.borderMuted,
          zIndex: 20,
        }}
      >
        {visible.map((member, i) => {
          const palette = personColors[i % personColors.length];
          return (
            <View key={member.userId} style={{ marginLeft: i === 0 ? 0 : tokens.pillStack.overlapOffset, zIndex: visible.length - i }}>
              <Avatar initials={getInitials(member.displayName)} bg={palette.text} url={member.avatarUrl} size="sm" />
            </View>
          );
        })}
        {overflow > 0 && (
          <View style={{ marginLeft: tokens.pillStack.overlapOffset }}>
            <Avatar initials={`+${overflow}`} bg="#3a3a5a" size="sm" />
          </View>
        )}
        {settlements.length > 0 && (
          <Pressable
            onPress={() => router.push(`/group/settle/${group.id}` as Parameters<typeof router.push>[0])}
            accessibilityRole="button"
            style={({ pressed }) => ({
              marginLeft: 'auto' as const,
              paddingHorizontal: tokens.spacing.sm,
              paddingVertical: tokens.spacing.xs,
              borderRadius: tokens.radius.pill,
              borderWidth: 1,
              borderColor: colors.primary.default,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text variant="caption" color={colors.primary.default}>{t('groups.detail.settle_up')}</Text>
          </Pressable>
        )}
      </View>

      <ScrollView
        contentContainerStyle={{ padding: tokens.spacing.md, paddingBottom: tokens.spacing.xxl + tokens.spacing.xl + TAB_BAR_HEIGHT }}
        showsVerticalScrollIndicator={false}
      >
        {/* Member balances — only when there are outstanding amounts */}
        {memberBalances.some(b => b.balanceCents !== 0) && (
          <View style={{ marginBottom: tokens.spacing.md, gap: tokens.spacing.xs }}>
            {memberBalances.filter(b => b.balanceCents !== 0).map(b => {
              const member = group.members.find(m => m.userId === b.userId);
              const name   = member?.displayName ?? b.userId;
              const isOwed = b.balanceCents > 0;
              return (
                <View key={b.userId} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text variant="caption" color={colors.text.secondary}>{name}</Text>
                  <Text variant="caption" color={isOwed ? colors.success.default : colors.error.default}>
                    {isOwed
                      ? `+${formatCurrency(b.balanceCents, group.currency)}`
                      : `−${formatCurrency(-b.balanceCents, group.currency)}`}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Active section */}
        {hasActiveItems ? (
          <>
            <SectionLabel title={t('groups.detail.active_section')} />
            {activeTrips.map((trip, i) => (
              <TripCard key={trip.id} trip={trip} index={i} onPress={handleTripPress} />
            ))}
            {activeGroupExpenses.map(expense => (
              <GroupExpenseCard
                key={expense.id}
                expense={expense}
                payerName={memberMap.get(expense.paidByUserId)?.displayName ?? 'Unknown'}
                onPress={handleExpensePress}
              />
            ))}
          </>
        ) : (
          <Text variant="caption" color={colors.text.tertiary} style={{ marginTop: tokens.spacing.md }}>
            {t('groups.detail.empty_active')}
          </Text>
        )}

        {/* Past section toggle */}
        {hasPastItems && (
          <>
            <Pressable
              onPress={() => setShowPast(p => !p)}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', paddingVertical: tokens.spacing.sm, opacity: pressed ? 0.6 : 1, marginTop: tokens.spacing.md })}
            >
              <Ionicons
                name={showPast ? 'chevron-up' : 'chevron-down'}
                size={14}
                color={colors.text.tertiary}
                style={{ marginRight: tokens.spacing.xs }}
              />
              <Text variant="caption" color={colors.text.tertiary}>
                {showPast ? t('groups.detail.hide_past') : t('groups.detail.view_past')}
              </Text>
            </Pressable>

            {showPast && (
              <Animated.View entering={Platform.OS !== 'web' ? FadeIn.duration(200) : undefined}>
                <SectionLabel title={t('groups.detail.past_section')} />
                {closedTrips.map((trip, i) => (
                  <TripCard key={trip.id} trip={trip} index={i} onPress={handleTripPress} />
                ))}
                {settledGroupExpenses.map(expense => (
                  <GroupExpenseCard
                    key={expense.id}
                    expense={expense}
                    payerName={memberMap.get(expense.paidByUserId)?.displayName ?? 'Unknown'}
                    onPress={handleExpensePress}
                  />
                ))}
              </Animated.View>
            )}
          </>
        )}
      </ScrollView>

      {/* FAB speed-dial */}
      <View style={{ position: 'absolute', bottom: tokens.spacing.xl, right: tokens.spacing.md, alignItems: 'flex-end', zIndex: 20 }}>
        <View style={{ marginBottom: tokens.spacing.sm, alignItems: 'flex-end', gap: tokens.spacing.sm }}>
          {/* Item 0 — New Trip (top, appears last) */}
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

          {/* Item 1 — New Expense */}
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

          {/* Item 2 — Add Member (bottom, appears first) */}
          <Animated.View style={fabItem2Style} pointerEvents={fabOpen ? 'auto' : 'none'}>
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

        <Animated.View entering={Platform.OS !== 'web' ? ZoomIn.delay(200).duration(300).springify() : undefined}>
          <Pressable
            onPress={() => setFabOpen(o => !o)}
            accessibilityRole="button"
            accessibilityLabel="Open actions"
            style={({ pressed }) => ({
              width: FAB_SIZE, height: FAB_SIZE, borderRadius: FAB_SIZE / 2,
              backgroundColor: colors.primary.default,
              alignItems: 'center', justifyContent: 'center',
              opacity: pressed ? 0.8 : 1, ...tokens.shadow.lg,
            })}
          >
            <Animated.View style={fabIconStyle}>
              <Ionicons name="add" size={24} color="#ffffff" />
            </Animated.View>
          </Pressable>
        </Animated.View>
      </View>
    </ScreenWrapper>
  );
}
