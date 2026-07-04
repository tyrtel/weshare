import React, { useState, useCallback, useEffect, useRef } from 'react';
import { SectionList, ScrollView, StyleSheet, View, Pressable, Platform, RefreshControl } from 'react-native';
import { useTranslation } from 'react-i18next';
import Animated, { ZoomIn, FadeIn, FadeOut, useSharedValue, useAnimatedStyle, withSpring, withTiming, withSequence } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenWrapper } from '../../src/components/ui/ScreenWrapper';
import { TAB_BAR_HEIGHT } from '../../src/components/ui/UniversalTabBar';
import { TripListSkeleton } from '../../src/components/skeletons/TripListSkeleton';
import { Text } from '../../src/components/ui/Text';
import { TripCard } from '../../src/features/trips/components/TripCard';
import { GroupCard } from '../../src/features/groups/components/GroupCard';
import { BalancePill } from '../../src/components/ui/BalancePill';
import { ActivityDot } from '../../src/components/ui/ActivityDot';
import { useTrips } from '../../src/features/trips/hooks/useTrips';
import { useGroups } from '../../src/features/groups/hooks/useGroups';
import { useService } from '../../src/core/di/ServiceContext';
import { AUTH } from '../../src/core/di/tokens';
import { useColors, ledgerColors } from '../../src/theme/colors';
import { tokens, ledgerRadius, ledgerShadow } from '../../src/theme/tokens';
import { useActiveTheme } from '../../src/core/ThemeContext';
import { formatCurrency } from '../../src/core/utils/formatCurrency';
import type { Trip } from '../../src/core/models/Trip';
import type { Group } from '../../src/core/models/Group';

const FAB_SIZE = 56;

type SectionItem =
  | { kind: 'group'; group: Group; tripCount: number }
  | { kind: 'trip'; trip: Trip };

function SectionHeader({ title }: { title: string }) {
  const colors = useColors();
  return (
    <View style={{ paddingHorizontal: tokens.spacing.md, paddingTop: tokens.spacing.md, paddingBottom: tokens.spacing.xs, backgroundColor: colors.background }}>
      <Text variant="label" color={colors.text.secondary} style={{ textTransform: 'uppercase', letterSpacing: 0.8, fontSize: 11 }}>
        {title}
      </Text>
    </View>
  );
}

function EmptyGroups() {
  const { t } = useTranslation();
  const colors = useColors();
  return (
    <View style={{ paddingHorizontal: tokens.spacing.md, paddingVertical: tokens.spacing.sm }}>
      <Text variant="caption" color={colors.text.tertiary}>{t('groups.list.empty')}</Text>
    </View>
  );
}

function EmptyTrips() {
  const { t } = useTranslation();
  const colors = useColors();
  return (
    <View style={{ paddingHorizontal: tokens.spacing.md, paddingVertical: tokens.spacing.sm }}>
      <Text variant="caption" color={colors.text.tertiary}>{t('trips.list.empty_body')}</Text>
    </View>
  );
}

export default function HomeScreen() {
  const { t }    = useTranslation();
  const router   = useRouter();
  const colors   = useColors();
  const auth     = useService(AUTH);
  const isSignedIn = !!auth.currentUser();

  const activeTheme = useActiveTheme();
  const isLedger = activeTheme === 'ledger';

  const { trips, summaries, loading: tripsLoading, refetch: refetchTrips } = useTrips();
  const { groups, groupTripCounts, groupSummaries, loading: groupsLoading, refetch: refetchGroups } = useGroups();

  // Standalone trips: no group parent
  const standaloneTrips = trips.filter(t => !t.groupId);

  const loading = tripsLoading || groupsLoading;

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchTrips(), refetchGroups()]);
    setRefreshing(false);
  }, [refetchTrips, refetchGroups]);

  // FAB speed-dial
  const [fabOpen, setFabOpen] = useState(false);
  const fabRotation     = useSharedValue(0);
  const fabMenuOpacity  = useSharedValue(0);
  const fabAttentionScale = useSharedValue(1);

  useEffect(() => {
    fabRotation.value    = withSpring(fabOpen ? 45 : 0, { damping: 15, stiffness: 200 });
    fabMenuOpacity.value = withTiming(fabOpen ? 1 : 0, { duration: 150 });
  }, [fabOpen, fabRotation, fabMenuOpacity]);

  // Brief pulse on first mount so first-time users notice the FAB is interactive.
  useEffect(() => {
    const timer = setTimeout(() => {
      fabAttentionScale.value = withSequence(
        withSpring(1.14, { damping: 6, stiffness: 280 }),
        withSpring(1,    { damping: 10, stiffness: 200 }),
      );
    }, 900);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fabIconStyle      = useAnimatedStyle(() => ({ transform: [{ rotate: `${fabRotation.value}deg` }] }));
  const fabMenuStyle      = useAnimatedStyle(() => ({ opacity: fabMenuOpacity.value, pointerEvents: fabOpen ? 'auto' : 'none' } as object));
  const fabAttentionStyle = useAnimatedStyle(() => ({ transform: [{ scale: fabAttentionScale.value }] }));

  const handleGroupPress = (group: Group) => router.push(`/group/${group.id}` as Parameters<typeof router.push>[0]);
  const handleTripPress  = (trip: Trip)   => router.push(`/trip/${trip.id}` as Parameters<typeof router.push>[0]);

  const handleNewGroup = () => { setFabOpen(false); router.push('/group/create' as Parameters<typeof router.push>[0]); };
  const handleNewTrip  = () => { setFabOpen(false); router.push('/trip/create' as Parameters<typeof router.push>[0]); };

  const groupItems: SectionItem[] = groups.map(g => ({ kind: 'group', group: g, tripCount: groupTripCounts[g.id] ?? 0 }));
  const tripItems:  SectionItem[] = standaloneTrips.map(t => ({ kind: 'trip', trip: t }));

  const sections = [
    { title: t('groups.list.section_title'), data: groupItems.length > 0 ? groupItems : [{ kind: 'empty-groups' as const }] },
    { title: t('trips.list.section_title'),  data: tripItems.length  > 0 ? tripItems  : [{ kind: 'empty-trips'  as const }] },
  ] as Array<{ title: string; data: (SectionItem | { kind: 'empty-groups' } | { kind: 'empty-trips' })[] }>;

  const renderItem = ({ item, index }: { item: SectionItem | { kind: 'empty-groups' } | { kind: 'empty-trips' }; index: number }) => {
    if (item.kind === 'empty-groups') return <EmptyGroups />;
    if (item.kind === 'empty-trips')  return <EmptyTrips />;
    if (item.kind === 'group') return (
      <View style={{ paddingHorizontal: tokens.spacing.md }}>
        <GroupCard group={item.group} index={index} tripCount={item.tripCount} summary={groupSummaries[item.group.id]} onPress={handleGroupPress} />
      </View>
    );
    return (
      <View style={{ paddingHorizontal: tokens.spacing.md }}>
        <TripCard trip={item.trip} index={index} onPress={handleTripPress} financialSummary={summaries?.[item.trip.id]} />
      </View>
    );
  };

  if (loading) return <ScreenWrapper><TripListSkeleton /></ScreenWrapper>;

  if (isLedger) {
    const overallNetCents = Object.values(groupSummaries).reduce((sum, s) => {
      if (s.direction === 'owed') return sum + s.amountCents;
      if (s.direction === 'owe')  return sum - s.amountCents;
      return sum;
    }, 0);
    const isAhead = overallNetCents >= 0;

    return (
      <View style={{ flex: 1, backgroundColor: ledgerColors.background }}>
        <SafeAreaView edges={['top']} style={{ backgroundColor: ledgerColors.background }}>
          {/* Hero header */}
          <View style={ledgerStyles.hero}>
            <View>
              <Text style={ledgerStyles.heroSub}>Overall, you're</Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                <Text style={[ledgerStyles.heroAmount, { color: isAhead ? ledgerColors.success.default : ledgerColors.error.default }]}>
                  {isAhead ? '+' : '−'}{formatCurrency(Math.abs(overallNetCents), 'EUR')}
                </Text>
                <Text style={ledgerStyles.heroLabel}>{isAhead ? 'ahead' : 'behind'}</Text>
              </View>
            </View>
            <Pressable
              onPress={() => setFabOpen(o => !o)}
              style={ledgerStyles.profileBtn}
              accessibilityRole="button"
            >
              <Feather name="user" size={19} color={ledgerColors.text.primary} />
            </Pressable>
          </View>
        </SafeAreaView>

        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: 80 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={ledgerColors.primary.default}
            />
          }
        >
          {/* Active trips section */}
          {standaloneTrips.length > 0 && (
            <>
              <View style={ledgerStyles.sectionRow}>
                <Text style={ledgerStyles.sectionTitle}>Active trips</Text>
                <Pressable onPress={handleNewTrip} hitSlop={8}>
                  <Text style={ledgerStyles.sectionAction}>New trip</Text>
                </Pressable>
              </View>
              {standaloneTrips.map(trip => (
                <Pressable
                  key={trip.id}
                  onPress={() => handleTripPress(trip)}
                  style={({ pressed }) => [ledgerStyles.card, { opacity: pressed ? 0.85 : 1, marginBottom: 12 }]}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                      <Text style={{ fontSize: 26 }}>{trip.emoji ?? '✈️'}</Text>
                      <View>
                        <Text style={ledgerStyles.cardTitle} numberOfLines={1}>{trip.name}</Text>
                        <Text style={ledgerStyles.cardMeta}>{trip.members.length} people</Text>
                      </View>
                    </View>
                    <View style={ledgerStyles.unsettledTag}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: ledgerColors.error.default }} />
                      <Text style={ledgerStyles.unsettledText}>Unsettled</Text>
                    </View>
                  </View>
                </Pressable>
              ))}
            </>
          )}

          {/* Groups section */}
          <View style={ledgerStyles.sectionRow}>
            <Text style={ledgerStyles.sectionTitle}>Groups</Text>
            <Pressable onPress={handleNewGroup} hitSlop={8}>
              <Text style={ledgerStyles.sectionAction}>New group</Text>
            </Pressable>
          </View>
          {groups.length === 0 && (
            <Text style={{ color: ledgerColors.text.tertiary, fontSize: 13, paddingVertical: 8 }}>
              No groups yet
            </Text>
          )}
          {groups.map(group => {
            const summary = groupSummaries[group.id];
            const pillCents = summary?.direction === 'owed' ? summary.amountCents
              : summary?.direction === 'owe' ? -summary.amountCents : 0;
            return (
              <Pressable
                key={group.id}
                onPress={() => handleGroupPress(group)}
                style={({ pressed }) => [ledgerStyles.card, { opacity: pressed ? 0.85 : 1, marginBottom: 12 }]}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', flex: 1 }}>
                    <View style={ledgerStyles.emojiTile}>
                      <Text style={{ fontSize: 20 }}>{group.emoji ?? '👥'}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={ledgerStyles.cardTitle} numberOfLines={1}>{group.name}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        <ActivityDot />
                        <Text style={ledgerStyles.cardMeta} numberOfLines={1}>
                          {groupTripCounts[group.id] ?? 0} trips · {group.members.length} members
                        </Text>
                      </View>
                    </View>
                  </View>
                  <BalancePill cents={pillCents} currency={group.currency} />
                </View>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Simple FAB */}
        <Pressable
          onPress={() => setFabOpen(o => !o)}
          style={ledgerStyles.fab}
          accessibilityRole="button"
          accessibilityLabel={t('home.fab_label')}
        >
          <Feather name="plus" size={26} color="#fff" />
        </Pressable>

        {/* Keep existing speed-dial overlay when open */}
        {fabOpen && (
          <Pressable
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 }}
            onPress={() => setFabOpen(false)}
          />
        )}
        <Animated.View style={[fabMenuStyle, { position: 'absolute', bottom: 100, right: 20, alignItems: 'flex-end', gap: 8, zIndex: 20 }]}>
          <Pressable
            onPress={handleNewGroup}
            style={({ pressed }) => ({
              flexDirection: 'row', alignItems: 'center',
              backgroundColor: ledgerColors.surface, borderRadius: 999,
              paddingHorizontal: 16, paddingVertical: 8,
              opacity: pressed ? 0.8 : 1, gap: 8,
              ...ledgerShadow.card,
            })}
          >
            <Feather name="users" size={16} color={ledgerColors.primary.default} />
            <Text style={{ fontSize: 14, color: ledgerColors.primary.default, fontWeight: '500' }}>
              {t('groups.create.fab_label')}
            </Text>
          </Pressable>
          <Pressable
            onPress={handleNewTrip}
            style={({ pressed }) => ({
              flexDirection: 'row', alignItems: 'center',
              backgroundColor: ledgerColors.surface, borderRadius: 999,
              paddingHorizontal: 16, paddingVertical: 8,
              opacity: pressed ? 0.8 : 1, gap: 8,
              ...ledgerShadow.card,
            })}
          >
            <Feather name="send" size={16} color={ledgerColors.primary.default} />
            <Text style={{ fontSize: 14, color: ledgerColors.primary.default, fontWeight: '500' }}>
              {t('trips.list.fab_label')}
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    );
  }

  return (
    <ScreenWrapper>
      {/* Header */}
      <View style={{ paddingHorizontal: tokens.spacing.md, paddingTop: tokens.spacing.md, paddingBottom: tokens.spacing.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="heading1">{t('home.title')}</Text>
      </View>

      {/* Dismiss overlay when FAB is open */}
      {fabOpen && (
        <Pressable
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 }}
          onPress={() => setFabOpen(false)}
        />
      )}

      <SectionList
        sections={sections}
        keyExtractor={(item, index) => {
          if ('group' in item && item.kind === 'group') return `g-${item.group.id}`;
          if ('trip'  in item && item.kind === 'trip')  return `t-${item.trip.id}`;
          return `empty-${index}`;
        }}
        renderItem={renderItem}
        renderSectionHeader={({ section }) => <SectionHeader title={section.title} />}
        contentContainerStyle={{ paddingBottom: tokens.spacing.xxl + tokens.spacing.xl + TAB_BAR_HEIGHT }}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary.default}
          />
        }
        ListFooterComponent={isSignedIn ? (
          <Pressable
            onPress={() => router.push('/trip/archive' as Parameters<typeof router.push>[0])}
            accessibilityRole="link"
            style={({ pressed }) => ({ alignItems: 'center', paddingVertical: tokens.spacing.lg, opacity: pressed ? 0.6 : 1 })}
          >
            <Text variant="caption" color={colors.text.tertiary}>{t('trips.list.past_trips_link')}</Text>
          </Pressable>
        ) : null}
      />

      {/* FAB speed-dial */}
      <View style={{ position: 'absolute', bottom: tokens.spacing.xl, right: tokens.spacing.md, alignItems: 'flex-end', zIndex: 20 }}>
        {/* Mini-actions */}
        <Animated.View style={[fabMenuStyle, { marginBottom: tokens.spacing.sm, alignItems: 'flex-end', gap: tokens.spacing.sm }]}>
          <Pressable
            onPress={handleNewGroup}
            accessibilityRole="button"
            accessibilityLabel={t('groups.create.fab_label')}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: colors.surface,
              borderRadius: tokens.radius.pill,
              paddingHorizontal: tokens.spacing.md,
              paddingVertical: tokens.spacing.sm,
              ...tokens.shadow.md,
              opacity: pressed ? 0.8 : 1,
              gap: tokens.spacing.xs,
            })}
          >
            <Ionicons name="people-outline" size={18} color={colors.primary.default} />
            <Text variant="label" color={colors.primary.default}>{t('groups.create.fab_label')}</Text>
          </Pressable>

          <Pressable
            onPress={handleNewTrip}
            accessibilityRole="button"
            accessibilityLabel={t('trips.list.fab_label')}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: colors.surface,
              borderRadius: tokens.radius.pill,
              paddingHorizontal: tokens.spacing.md,
              paddingVertical: tokens.spacing.sm,
              ...tokens.shadow.md,
              opacity: pressed ? 0.8 : 1,
              gap: tokens.spacing.xs,
            })}
          >
            <Ionicons name="airplane-outline" size={18} color={colors.primary.default} />
            <Text variant="label" color={colors.primary.default}>{t('trips.list.fab_label')}</Text>
          </Pressable>
        </Animated.View>

        {/* Main FAB */}
        <Animated.View
          entering={Platform.OS !== 'web' ? ZoomIn.delay(200).duration(300).springify() : undefined}
          style={fabAttentionStyle}
        >
          <Pressable
            onPress={() => setFabOpen(o => !o)}
            accessibilityRole="button"
            accessibilityLabel={t('home.fab_label')}
            style={({ pressed }) => ({
              width: FAB_SIZE,
              height: FAB_SIZE,
              borderRadius: FAB_SIZE / 2,
              backgroundColor: colors.primary.default,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.8 : 1,
              ...tokens.shadow.lg,
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

const ledgerStyles = StyleSheet.create({
  hero: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  heroSub: { fontSize: 14, color: ledgerColors.text.secondary, marginBottom: 2 },
  heroAmount: { fontSize: 32, fontWeight: '700', fontVariant: ['tabular-nums'] },
  heroLabel: { fontSize: 18, fontWeight: '700', color: ledgerColors.text.primary },
  profileBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: ledgerColors.surface,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: ledgerColors.border,
  },
  sectionRow: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
    marginTop: 8, marginBottom: 12,
  },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: ledgerColors.text.primary, letterSpacing: -0.3 },
  sectionAction: { fontSize: 13, fontWeight: '600', color: ledgerColors.primary.default },
  card: {
    backgroundColor: ledgerColors.surface,
    borderRadius: ledgerRadius.card,
    padding: 16,
    ...ledgerShadow.card,
  },
  cardTitle: { fontSize: 15.5, fontWeight: '600', color: ledgerColors.text.primary },
  cardMeta: { fontSize: 12.5, color: ledgerColors.text.secondary, marginTop: 1 },
  emojiTile: {
    width: 42, height: 42, borderRadius: ledgerRadius.md,
    backgroundColor: ledgerColors.background,
    alignItems: 'center', justifyContent: 'center',
  },
  unsettledTag: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: ledgerColors.error.bg,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: ledgerRadius.pill,
  },
  unsettledText: { fontSize: 12, fontWeight: '500', color: ledgerColors.error.default },
  fab: {
    position: 'absolute', right: 20, bottom: 32,
    width: 58, height: 58, borderRadius: 29,
    backgroundColor: ledgerColors.primary.default,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: ledgerColors.primary.dim,
    shadowOpacity: 0.35, shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 }, elevation: 6,
    zIndex: 20,
  },
});
