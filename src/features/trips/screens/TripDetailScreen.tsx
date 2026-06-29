import React, { useState, useCallback, useMemo } from 'react';
import { View, FlatList, Pressable, RefreshControl } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ScreenWrapper } from '../../../components/ui/ScreenWrapper';
import { TAB_BAR_HEIGHT } from '../../../components/ui/UniversalTabBar';
import { TripDetailSkeleton } from '../../../components/skeletons/TripDetailSkeleton';
import { Text } from '../../../components/ui/Text';
import { Ionicons } from '@expo/vector-icons';
import { ExpenseRow } from '../components/ExpenseRow';
import { TripFAB } from '../components/TripFAB';
import { TripListHeader } from '../components/TripListHeader';
import { useTripDetail } from '../hooks/useTripDetail';
import { useService } from '../../../core/di/ServiceContext';
import { TRIP_STORE } from '../../../core/di/tokens';
import { confirm } from '../../../core/utils/confirm';
import { useColors } from '../../../theme/colors';
import { tokens } from '../../../theme/tokens';
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
