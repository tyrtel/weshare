import React, { useState, useCallback, useEffect } from 'react';
import { ScrollView, StyleSheet, View, Pressable, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, withSequence } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '../../src/components/ui/Text';
import { ErrorBanner } from '../../src/components/ui/ErrorBanner';
import { BalancePill } from '../../src/components/ui/BalancePill';
import { ActivityDot } from '../../src/components/ui/ActivityDot';
import { ProfileMenuSheet } from '../../src/components/ui/ProfileMenuSheet';
import { useTrips } from '../../src/features/trips/hooks/useTrips';
import { useGroups } from '../../src/features/groups/hooks/useGroups';
import { useService } from '../../src/core/di/ServiceContext';
import { AUTH } from '../../src/core/di/tokens';
import { useColors } from '../../src/theme/colors';
import { ledgerRadius, ledgerShadow, ledgerFonts } from '../../src/theme/tokens';
import { formatCurrency } from '../../src/core/utils/formatCurrency';
import type { Trip } from '../../src/core/models/Trip';
import type { Group } from '../../src/core/models/Group';

export default function HomeScreen() {
  const { t }  = useTranslation();
  const router = useRouter();
  const auth   = useService(AUTH);
  const colors = useColors();

  const { trips, summaries, loading: tripsLoading, error: tripsError, refetch: refetchTrips } = useTrips();
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
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
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
  const handleLogOut     = () => {
    Alert.alert(
      t('home.profile_menu.log_out_confirm_title'),
      t('home.profile_menu.log_out_confirm_body'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('home.profile_menu.log_out'), style: 'destructive', onPress: () => { void auth.signOut(); } },
      ],
    );
  };

  // Sum every line the screen actually shows below — one standalone trip
  // pill per trip, one group pill per group — so this always matches what's
  // visible, rather than drifting from it (previously this only summed
  // groups and silently ignored every standalone trip).
  const tripsNetCents = standaloneTrips.reduce((sum, trip) => {
    const summary = summaries[trip.id];
    if (summary?.direction === 'owed') return sum + summary.amountCents;
    if (summary?.direction === 'owe')  return sum - summary.amountCents;
    return sum;
  }, 0);
  const groupsNetCents = Object.values(groupSummaries).reduce((sum, s) => {
    if (s.direction === 'owed') return sum + s.amountCents;
    if (s.direction === 'owe')  return sum - s.amountCents;
    return sum;
  }, 0);
  const overallNetCents = tripsNetCents + groupsNetCents;
  const isAhead = overallNetCents >= 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.background }}>
        <View style={styles.hero}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <Text style={[styles.heroLine, { color: colors.text.primary }]}>{t('home.hero_label')}</Text>
            <Text style={[styles.heroLine, { color: isAhead ? colors.success.default : colors.error.default, fontVariant: ['tabular-nums'] }]}>
              {isAhead ? '+' : '−'}{formatCurrency(Math.abs(overallNetCents), 'EUR')}
            </Text>
          </View>
          <Pressable
            onPress={() => setProfileMenuOpen(true)}
            style={[styles.profileBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
            accessibilityRole="button"
            accessibilityLabel={t('home.profile_menu.open_label')}
          >
            <Feather name="user" size={19} color={colors.text.primary} />
          </Pressable>
        </View>
      </SafeAreaView>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary.default} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: 80 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary.default}
            />
          }
        >
          {tripsError && (
            <View style={{ marginBottom: 16 }}>
              <ErrorBanner error={tripsError} fallback={t('trips.list.error_load')} />
              <Pressable
                onPress={() => void refetchTrips()}
                accessibilityRole="button"
                style={({ pressed }) => ({
                  alignSelf: 'flex-start',
                  marginTop: 8,
                  paddingHorizontal: 14,
                  paddingVertical: 6,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: colors.primary.default,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primary.default }}>
                  {t('common.try_again')}
                </Text>
              </Pressable>
            </View>
          )}

          {/* Active trips */}
          {standaloneTrips.length > 0 && (
            <>
              <View style={styles.sectionRow}>
                <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>{t('trips.list.section_title')}</Text>
                <Pressable onPress={handleNewTrip} hitSlop={8}>
                  <Text style={[styles.sectionAction, { color: colors.primary.default }]}>{t('trips.list.fab_label')}</Text>
                </Pressable>
              </View>
              {standaloneTrips.map(trip => {
                const summary = summaries[trip.id];
                const pillCents = summary?.direction === 'owed' ? summary.amountCents
                  : summary?.direction === 'owe' ? -summary.amountCents : 0;
                return (
                  <Pressable
                    key={trip.id}
                    onPress={() => handleTripPress(trip)}
                    style={({ pressed }) => [styles.card, { backgroundColor: colors.surface, opacity: pressed ? 0.85 : 1, marginBottom: 12 }]}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                        <Text style={{ fontSize: 26 }}>✈️</Text>
                        <View>
                          <Text style={[styles.cardTitle, { color: colors.text.primary }]} numberOfLines={1}>{trip.name}</Text>
                          <Text style={[styles.cardMeta, { color: colors.text.secondary }]}>{t('home.trip_people_count', { count: trip.members.length })}</Text>
                        </View>
                      </View>
                      <BalancePill cents={pillCents} currency={trip.currency} />
                    </View>
                  </Pressable>
                );
              })}
            </>
          )}

          <Pressable
            testID="past-trips-link"
            onPress={() => router.push('/trip/archive' as Parameters<typeof router.push>[0])}
            accessibilityRole="button"
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              marginBottom: 20,
              padding: 16,
              borderRadius: ledgerRadius.card,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Feather name="archive" size={18} color={colors.text.secondary} />
            <Text style={{ flex: 1, marginLeft: 10, fontSize: 14, fontWeight: '600', color: colors.text.secondary }}>
              {t('trips.list.past_trips_link')}
            </Text>
            <Feather name="chevron-right" size={18} color={colors.text.tertiary} />
          </Pressable>

          {/* Groups */}
          <View style={styles.sectionRow}>
            <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>{t('groups.list.section_title')}</Text>
            <Pressable onPress={handleNewGroup} hitSlop={8}>
              <Text style={[styles.sectionAction, { color: colors.primary.default }]}>{t('groups.create.fab_label')}</Text>
            </Pressable>
          </View>
          {groups.length === 0 && (
            <Text style={{ color: colors.text.tertiary, fontSize: 13, paddingVertical: 8 }}>
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
                style={({ pressed }) => [styles.card, { backgroundColor: colors.surface, opacity: pressed ? 0.85 : 1, marginBottom: 12 }]}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', flex: 1 }}>
                    <View style={[styles.emojiTile, { backgroundColor: colors.background }]}>
                      <Text style={{ fontSize: 20 }}>👥</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.cardTitle, { color: colors.text.primary }]} numberOfLines={1}>{group.name}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        <ActivityDot />
                        <Text style={[styles.cardMeta, { color: colors.text.secondary }]} numberOfLines={1}>
                          {t('groups.card.trip_count', { count: groupTripCounts[group.id] ?? 0 })} · {t('groups.card.member_count', { count: group.members.length })}
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
          style={[styles.fab, { backgroundColor: colors.primary.default, shadowColor: colors.primary.dim }]}
          accessibilityRole="button"
          accessibilityLabel={t('home.fab_label')}
        >
          <Feather name="plus" size={26} color={colors.text.inverse} />
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
            backgroundColor: colors.surface, borderRadius: 999,
            paddingHorizontal: 16, paddingVertical: 8,
            opacity: pressed ? 0.8 : 1, gap: 8,
            ...ledgerShadow.card,
          })}
        >
          <Feather name="users" size={16} color={colors.primary.default} />
          <Text style={{ fontSize: 14, color: colors.primary.default, fontFamily: ledgerFonts.bodySemibold }}>
            {t('groups.create.fab_label')}
          </Text>
        </Pressable>
        <Pressable
          onPress={handleNewTrip}
          style={({ pressed }) => ({
            flexDirection: 'row', alignItems: 'center',
            backgroundColor: colors.surface, borderRadius: 999,
            paddingHorizontal: 16, paddingVertical: 8,
            opacity: pressed ? 0.8 : 1, gap: 8,
            ...ledgerShadow.card,
          })}
        >
          <Feather name="send" size={16} color={colors.primary.default} />
          <Text style={{ fontSize: 14, color: colors.primary.default, fontFamily: ledgerFonts.bodySemibold }}>
            {t('trips.list.fab_label')}
          </Text>
        </Pressable>
      </Animated.View>

      <ProfileMenuSheet
        visible={profileMenuOpen}
        onClose={() => setProfileMenuOpen(false)}
        onNewTrip={handleNewTrip}
        onNewGroup={handleNewGroup}
        onLogOut={handleLogOut}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16,
  },
  heroLine: { fontFamily: ledgerFonts.display, fontSize: 22 },
  profileBtn: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  sectionRow: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
    marginTop: 8, marginBottom: 12,
  },
  sectionTitle:  { fontFamily: ledgerFonts.display, fontSize: 18, letterSpacing: -0.3 },
  sectionAction: { fontSize: 13, fontFamily: ledgerFonts.bodySemibold },
  card: {
    borderRadius: ledgerRadius.card,
    padding: 16,
    ...ledgerShadow.card,
  },
  cardTitle: { fontSize: 15.5, fontFamily: ledgerFonts.bodySemibold },
  cardMeta:  { fontSize: 12.5, marginTop: 1, fontFamily: ledgerFonts.body },
  emojiTile: {
    width: 42, height: 42, borderRadius: ledgerRadius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  fabWrap: { position: 'absolute', right: 20, bottom: 32, zIndex: 20 },
  fab: {
    width: 58, height: 58, borderRadius: 29,
    alignItems: 'center', justifyContent: 'center',
    shadowOpacity: 0.35, shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 }, elevation: 6,
  },
});
