import React from 'react';
import { View, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { ScreenWrapper } from '../../../components/ui/ScreenWrapper';
import { TripListSkeleton } from '../../../components/skeletons/TripListSkeleton';
import { Text } from '../../../components/ui/Text';
import { ClosedTripCard } from '../components/ClosedTripCard';
import { useClosedTrips } from '../hooks/useClosedTrips';
import { useTripSessionStore } from '../../../core/di/ServiceContext';
import { useColors } from '../../../theme/colors';
import { tokens } from '../../../theme/tokens';

function EmptyState() {
  const colors = useColors();
  return (
    <View
      testID="closed-trips-empty"
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: tokens.spacing.xxl,
        paddingHorizontal: tokens.spacing.xl,
      }}
    >
      <Ionicons name="archive-outline" size={48} color={colors.text.tertiary} style={{ marginBottom: tokens.spacing.md }} />
      <Text variant="body" color={colors.text.secondary} style={{ textAlign: 'center' }}>
        No past trips yet.
      </Text>
    </View>
  );
}

export function ClosedTripsScreen() {
  const { trips, loading } = useClosedTrips();
  const allExpenses = useTripSessionStore(s => s.expenses);

  if (loading) {
    return (
      <ScreenWrapper>
        <Stack.Screen options={{ title: 'Past Trips' }} />
        <TripListSkeleton />
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <Stack.Screen options={{ title: 'Past Trips' }} />
      <FlatList
        data={trips}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <ClosedTripCard
            trip={item}
            expenseCount={allExpenses[item.id]?.length ?? 0}
          />
        )}
        contentContainerStyle={{
          paddingHorizontal: tokens.spacing.md,
          paddingVertical: tokens.spacing.md,
          flexGrow: 1,
        }}
        ListEmptyComponent={<EmptyState />}
        showsVerticalScrollIndicator={false}
      />
    </ScreenWrapper>
  );
}
