import React, { useState, useCallback, useEffect, useRef } from 'react';
import { SectionList, View, Pressable, Platform, RefreshControl } from 'react-native';
import { useTranslation } from 'react-i18next';
import Animated, { ZoomIn, FadeIn, FadeOut, useSharedValue, useAnimatedStyle, withSpring, withTiming, withSequence } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ScreenWrapper } from '../../src/components/ui/ScreenWrapper';
import { TAB_BAR_HEIGHT } from '../../src/components/ui/UniversalTabBar';
import { TripListSkeleton } from '../../src/components/skeletons/TripListSkeleton';
import { Text } from '../../src/components/ui/Text';
import { TripCard } from '../../src/features/trips/components/TripCard';
import { GroupCard } from '../../src/features/groups/components/GroupCard';
import { useTrips } from '../../src/features/trips/hooks/useTrips';
import { useGroups } from '../../src/features/groups/hooks/useGroups';
import { useService } from '../../src/core/di/ServiceContext';
import { AUTH } from '../../src/core/di/tokens';
import { useColors } from '../../src/theme/colors';
import { tokens } from '../../src/theme/tokens';
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
