import React, { useState, useCallback, useEffect } from 'react';
import { FlatList, View, Pressable, Platform, RefreshControl } from 'react-native';
import { useTranslation } from 'react-i18next';
import Animated, {
  ZoomIn,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ScreenWrapper } from '../../../components/ui/ScreenWrapper';
import { TAB_BAR_HEIGHT } from '../../../components/ui/UniversalTabBar';
import { TripListSkeleton } from '../../../components/skeletons/TripListSkeleton';
import { Text } from '../../../components/ui/Text';
import { TripCard } from '../components/TripCard';
import { useTrips } from '../hooks/useTrips';
import { useService } from '../../../core/di/ServiceContext';
import { AUTH } from '../../../core/di/tokens';
import { useColors } from '../../../theme/colors';
import { tokens } from '../../../theme/tokens';
import type { Trip } from '../../../core/models/Trip';

const FAB_COMPACT  = 56;
const FAB_EXTENDED = 152;

function ReceiptIllustration() {
  const colors = useColors();
  return (
    <View style={{ alignItems: 'center', marginBottom: tokens.spacing.lg }}>
      <View
        style={{
          width: 64,
          height: 80,
          backgroundColor: colors.surface,
          borderRadius: tokens.radius.md,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: 'center',
          justifyContent: 'flex-end',
          paddingBottom: tokens.spacing.sm,
          overflow: 'hidden',
        }}
      >
        <View style={{ width: 40, height: 4, backgroundColor: colors.border, borderRadius: 2, marginBottom: 6 }} />
        <View style={{ width: 32, height: 3, backgroundColor: colors.borderMuted, borderRadius: 2, marginBottom: 6 }} />
        <View style={{ width: 36, height: 3, backgroundColor: colors.borderMuted, borderRadius: 2, marginBottom: 10 }} />
        <Text variant="heading3" color={colors.text.tertiary}>?</Text>
      </View>
      {/* Jagged receipt bottom */}
      <View style={{ flexDirection: 'row', marginTop: -1 }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <View
            key={i}
            style={{
              width: 8,
              height: 6,
              borderBottomLeftRadius: 4,
              borderBottomRightRadius: 4,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderTopWidth: 0,
              borderColor: colors.border,
            }}
          />
        ))}
      </View>
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
      <ReceiptIllustration />
      <Text
        variant="heading2"
        style={{ marginBottom: tokens.spacing.sm, textAlign: 'center' }}
      >
        {t('trips.list.empty_title')}
      </Text>
      <Text
        variant="body"
        color={colors.text.secondary}
        style={{ textAlign: 'center' }}
      >
        {t('trips.list.empty_body')}
      </Text>
    </View>
  );
}

export function TripListScreen() {
  const { t } = useTranslation();
  const router  = useRouter();
  const colors  = useColors();
  const auth    = useService(AUTH);
  const { trips, summaries, loading, error, refetch } = useTrips();
  const isSignedIn = !!auth.currentUser();
  const [refreshing, setRefreshing] = useState(false);

  const isExtended  = trips.length === 0;
  const fabWidth    = useSharedValue(FAB_COMPACT);
  const labelOpacity = useSharedValue(0);

  useEffect(() => {
    fabWidth.value    = withSpring(isExtended ? FAB_EXTENDED : FAB_COMPACT, { damping: 15, stiffness: 200 });
    labelOpacity.value = withTiming(isExtended ? 1 : 0, { duration: 200 });
  }, [isExtended, fabWidth, labelOpacity]);

  const animatedFabStyle   = useAnimatedStyle(() => ({ width: fabWidth.value }));
  const animatedLabelStyle = useAnimatedStyle(() => ({ opacity: labelOpacity.value }));

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleTripPress = (trip: Trip) => {
    router.push(`/trip/${trip.id}`);
  };

  const handleCreate = () => {
    router.push('/trip/create');
  };

  return (
    <ScreenWrapper>
      {/* Header */}
      <View
        style={{
          paddingHorizontal: tokens.spacing.md,
          paddingTop: tokens.spacing.md,
          paddingBottom: tokens.spacing.sm,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Text variant="heading1">{t('trips.list.title')}</Text>
      </View>

      {/* List / loading / error / empty */}
      {loading && trips.length === 0 ? (
        <TripListSkeleton />
      ) : error && trips.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: tokens.spacing.xl }}>
          <Text variant="body" color={colors.text.secondary} style={{ textAlign: 'center', marginBottom: tokens.spacing.md }}>
            {t('trips.list.error_load')}
          </Text>
          <Pressable
            onPress={refetch}
            accessibilityRole="button"
            style={({ pressed }) => ({
              paddingHorizontal: tokens.spacing.lg,
              paddingVertical: tokens.spacing.sm,
              borderRadius: tokens.radius.pill,
              borderWidth: 1,
              borderColor: colors.primary.default,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text variant="label" color={colors.primary.default}>{t('common.try_again')}</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={trips}
          keyExtractor={item => item.id}
          renderItem={({ item, index }) => (
              <TripCard
                trip={item}
                index={index}
                onPress={handleTripPress}
                financialSummary={summaries?.[item.id]}
              />
            )}
          contentContainerStyle={{
            paddingHorizontal: tokens.spacing.md,
            paddingBottom: tokens.spacing.xxl + tokens.spacing.xl + TAB_BAR_HEIGHT,
            flexGrow: 1,
          }}
          ListEmptyComponent={<EmptyState />}
          ListFooterComponent={isSignedIn ? (
            <Pressable
              testID="past-trips-link"
              onPress={() => router.push('/trip/archive')}
              accessibilityRole="link"
              style={({ pressed }) => ({
                alignItems: 'center',
                paddingVertical: tokens.spacing.lg,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Text variant="caption" color={colors.text.tertiary}>{t('trips.list.past_trips_link')}</Text>
            </Pressable>
          ) : null}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing || loading}
              onRefresh={handleRefresh}
              tintColor={colors.primary.default}
              colors={[colors.primary.default]}
            />
          }
        />
      )}

      {/* Extended FAB */}
      <Animated.View
        entering={Platform.OS !== 'web' ? ZoomIn.delay(200).duration(300).springify() : undefined}
        style={{ position: 'absolute', bottom: tokens.spacing.xl, right: tokens.spacing.md }}
      >
        <Animated.View
          style={[
            animatedFabStyle,
            {
              height: FAB_COMPACT,
              borderRadius: FAB_COMPACT / 2,
              overflow: 'hidden',
              ...tokens.shadow.lg,
            },
          ]}
        >
          <Pressable
            onPress={handleCreate}
            accessibilityRole="button"
            accessibilityLabel={isExtended ? t('trips.list.fab_label') : t('trips.list.fab_label_compact')}
            style={({ pressed }) => ({
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: tokens.spacing.md,
              backgroundColor: colors.primary.default,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Ionicons name="add" size={24} color="#ffffff" />
            <Animated.View style={[animatedLabelStyle, { marginLeft: tokens.spacing.xs }]}>
              <Text variant="label" color="#ffffff">{t('trips.list.fab_label')}</Text>
            </Animated.View>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </ScreenWrapper>
  );
}
