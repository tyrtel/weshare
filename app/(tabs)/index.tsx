import React, { useState, useCallback, useEffect } from 'react';
import { ScrollView, StyleSheet, View, Pressable, RefreshControl, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, withSequence } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '../../src/components/ui/Text';
import { BalancePill } from '../../src/components/ui/BalancePill';
import { ActivityDot } from '../../src/components/ui/ActivityDot';
import { useTrips } from '../../src/features/trips/hooks/useTrips';
import { useGroups } from '../../src/features/groups/hooks/useGroups';
import { ledgerColors } from '../../src/theme/colors';
import { ledgerRadius, ledgerShadow, ledgerFonts } from '../../src/theme/tokens';
import { formatCurrency } from '../../src/core/utils/formatCurrency';
import type { Trip } from '../../src/core/models/Trip';
import type { Group } from '../../src/core/models/Group';

export default function HomeScreen() {
  const { t }  = useTranslation();
  const router = useRouter();

  const { trips, loading: tripsLoading, refetch: refetchTrips } = useTrips();
  const { groups, groupTripCounts, groupSummaries, loading: groupsLoading, refetch: refetchGroups } = useGroups();

  const standaloneTrips = trips.filter(tr => !tr.groupId);
  const loading = tripsLoading || groupsLoading;

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchTrips(), refetchGroups()]);
    setRefreshing(false);
  }, [refetchTrips, refetchGroups]);

  // FAB speed-dial
  const [fabOpen, setFabOpen] = useState(false);
  const fabMenuOpacity    = useSharedValue(0);
  const fabAttentionScale = useSharedValue(1);

  useEffect(() => {
    fabMenuOpacity.value = withTiming(fabOpen ? 1 : 0, { duration: 150 });
  }, [fabOpen, fabMenuOpacity]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fabAttentionScale.value = withSequence(
        withSpring(1.14, { damping: 6,  stiffness: 280 }),
        withSpring(1,    { damping: 10, stiffness: 200 }),
      );
    }, 900);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fabMenuStyle      = useAnimatedStyle(() => ({ opacity: fabMenuOpacity.value, pointerEvents: fabOpen ? 'auto' : 'none' } as object));
  const fabAttentionStyle = useAnimatedStyle(() => ({ transform: [{ scale: fabAttentionScale.value }] }));

  const handleGroupPress = (group: Group) => router.push(`/group/${group.id}` as Parameters<typeof router.push>[0]);
  const handleTripPress  = (trip: Trip)   => router.push(`/trip/${trip.id}` as Parameters<typeof router.push>[0]);
  const handleNewGroup   = () => { setFabOpen(false); router.push('/group/create' as Parameters<typeof router.push>[0]); };
  const handleNewTrip    = () => { setFabOpen(false); router.push('/trip/create' as Parameters<typeof router.push>[0]); };

  const overallNetCents = Object.values(groupSummaries).reduce((sum, s) => {
    if (s.direction === 'owed') return sum + s.amountCents;
    if (s.direction === 'owe')  return sum - s.amountCents;
    return sum;
  }, 0);
  const isAhead = overallNetCents >= 0;

  return (
    <View style={{ flex: 1, backgroundColor: ledgerColors.background }}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: ledgerColors.background }}>
        <View style={styles.hero}>
          <View>
            <Text style={styles.heroSub}>Overall, you're</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
              <Text style={[styles.heroAmount, { color: isAhead ? ledgerColors.success.default : ledgerColors.error.default }]}>
                {isAhead ? '+' : '−'}{formatCurrency(Math.abs(overallNetCents), 'EUR')}
              </Text>
              <Text style={styles.heroLabel}>{isAhead ? 'ahead' : 'behind'}</Text>
            </View>
          </View>
          <Pressable
            onPress={() => setFabOpen(o => !o)}
            style={styles.profileBtn}
            accessibilityRole="button"
          >
            <Feather name="user" size={19} color={ledgerColors.text.primary} />
          </Pressable>
        </View>
      </SafeAreaView>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={ledgerColors.primary.default} />
        </View>
      ) : (
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
          {/* Active trips */}
          {standaloneTrips.length > 0 && (
            <>
              <View style={styles.sectionRow}>
                <Text style={styles.sectionTitle}>{t('trips.list.section_title')}</Text>
                <Pressable onPress={handleNewTrip} hitSlop={8}>
                  <Text style={styles.sectionAction}>{t('trips.list.fab_label')}</Text>
                </Pressable>
              </View>
              {standaloneTrips.map(trip => (
                <Pressable
                  key={trip.id}
                  onPress={() => handleTripPress(trip)}
                  style={({ pressed }) => [styles.card, { opacity: pressed ? 0.85 : 1, marginBottom: 12 }]}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                      <Text style={{ fontSize: 26 }}>{(trip as any).emoji ?? '✈️'}</Text>
                      <View>
                        <Text style={styles.cardTitle} numberOfLines={1}>{trip.name}</Text>
                        <Text style={styles.cardMeta}>{trip.members.length} people</Text>
                      </View>
                    </View>
                    <View style={styles.unsettledTag}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: ledgerColors.error.default }} />
                      <Text style={styles.unsettledText}>Unsettled</Text>
                    </View>
                  </View>
                </Pressable>
              ))}
            </>
          )}

          {/* Groups */}
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>{t('groups.list.section_title')}</Text>
            <Pressable onPress={handleNewGroup} hitSlop={8}>
              <Text style={styles.sectionAction}>{t('groups.create.fab_label')}</Text>
            </Pressable>
          </View>
          {groups.length === 0 && (
            <Text style={{ color: ledgerColors.text.tertiary, fontSize: 13, paddingVertical: 8 }}>
              {t('groups.list.empty')}
            </Text>
          )}
          {groups.map(group => {
            const summary  = groupSummaries[group.id];
            const pillCents = summary?.direction === 'owed' ? summary.amountCents
              : summary?.direction === 'owe' ? -summary.amountCents : 0;
            return (
              <Pressable
                key={group.id}
                onPress={() => handleGroupPress(group)}
                style={({ pressed }) => [styles.card, { opacity: pressed ? 0.85 : 1, marginBottom: 12 }]}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', flex: 1 }}>
                    <View style={styles.emojiTile}>
                      <Text style={{ fontSize: 20 }}>{(group as any).emoji ?? '👥'}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle} numberOfLines={1}>{group.name}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        <ActivityDot />
                        <Text style={styles.cardMeta} numberOfLines={1}>
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
      )}

      {/* FAB */}
      <Animated.View style={[fabAttentionStyle, styles.fabWrap]}>
        <Pressable
          onPress={() => setFabOpen(o => !o)}
          style={styles.fab}
          accessibilityRole="button"
          accessibilityLabel={t('home.fab_label')}
        >
          <Feather name="plus" size={26} color="#fff" />
        </Pressable>
      </Animated.View>

      {/* FAB backdrop */}
      {fabOpen && (
        <Pressable
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 }}
          onPress={() => setFabOpen(false)}
        />
      )}

      {/* FAB speed-dial pills */}
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
          <Text style={{ fontSize: 14, color: ledgerColors.primary.default, fontFamily: ledgerFonts.bodySemibold }}>
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
          <Text style={{ fontSize: 14, color: ledgerColors.primary.default, fontFamily: ledgerFonts.bodySemibold }}>
            {t('trips.list.fab_label')}
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16,
  },
  heroSub:    { fontSize: 14, color: ledgerColors.text.secondary, marginBottom: 2, fontFamily: ledgerFonts.body },
  heroAmount: { fontFamily: ledgerFonts.display, fontSize: 32, fontVariant: ['tabular-nums'] },
  heroLabel:  { fontFamily: ledgerFonts.display, fontSize: 18, color: ledgerColors.text.primary },
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
  sectionTitle:  { fontFamily: ledgerFonts.display, fontSize: 18, color: ledgerColors.text.primary, letterSpacing: -0.3 },
  sectionAction: { fontSize: 13, fontFamily: ledgerFonts.bodySemibold, color: ledgerColors.primary.default },
  card: {
    backgroundColor: ledgerColors.surface,
    borderRadius: ledgerRadius.card,
    padding: 16,
    ...ledgerShadow.card,
  },
  cardTitle: { fontSize: 15.5, fontFamily: ledgerFonts.bodySemibold, color: ledgerColors.text.primary },
  cardMeta:  { fontSize: 12.5, color: ledgerColors.text.secondary, marginTop: 1, fontFamily: ledgerFonts.body },
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
  unsettledText: { fontSize: 12, fontFamily: ledgerFonts.bodyMedium, color: ledgerColors.error.default },
  fabWrap: { position: 'absolute', right: 20, bottom: 32, zIndex: 20 },
  fab: {
    width: 58, height: 58, borderRadius: 29,
    backgroundColor: ledgerColors.primary.default,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: ledgerColors.primary.dim,
    shadowOpacity: 0.35, shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 }, elevation: 6,
  },
});
