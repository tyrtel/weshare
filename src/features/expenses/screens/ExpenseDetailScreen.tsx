import React, { useState, useEffect } from 'react';
import { View, ScrollView, ActivityIndicator, Platform, Pressable, Image } from 'react-native';
import Animated, { SlideInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { z } from 'zod';
import { ScreenWrapper } from '../../../components/ui/ScreenWrapper';
import { TAB_BAR_HEIGHT } from '../../../components/ui/UniversalTabBar';
import { Text } from '../../../components/ui/Text';
import { Badge } from '../../../components/ui/Badge';
import { Avatar } from '../../../components/ui/Avatar';
import { Divider } from '../../../components/ui/Divider';
import { useExpenseDetail } from '../hooks/useExpenseDetail';
import { useReceiptStorage } from '../../../hooks/useReceiptStorage';
import { useService, useTripSessionStore } from '../../../core/di/ServiceContext';
import { MEMBER_REPO, TRIP_STORE } from '../../../core/di/tokens';
import { useColors } from '../../../theme/colors';
import { personColors } from '../../../theme/colors';
import { tokens } from '../../../theme/tokens';
import { confirm } from '../../../core/utils/confirm';
import { formatCurrency } from '../../../core/utils/formatCurrency';
import { isOk } from '../../../core/types/Result';
import type { TripMember } from '../../../core/models/TripMember';

const expenseDetailParamsSchema = z.object({
  id: z.string().min(1),
});


function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function ExpenseDetailScreen() {
  const raw    = useLocalSearchParams();
  const parsed = expenseDetailParamsSchema.safeParse(raw);

  if (!parsed.success) {
    return (
      <ScreenWrapper>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: tokens.spacing.lg }}>
          <Text variant="body" style={{ textAlign: 'center' }}>
            Invalid navigation parameters.
          </Text>
        </View>
      </ScreenWrapper>
    );
  }

  return <ExpenseDetailScreenContent id={parsed.data.id} />;
}

function ExpenseDetailScreenContent({ id }: { id: string }) {
  const router     = useRouter();
  const colors     = useColors();
  const memberRepo = useService(MEMBER_REPO);
  const storeApi   = useService(TRIP_STORE);

  const { expense, loading, error } = useExpenseDetail(id);
  const { getReceiptUrl }           = useReceiptStorage();
  const tripClosed = useTripSessionStore(
    s => s.trips.find(t => t.id === expense?.tripId)?.status === 'closed',
  );
  const [members,    setMembers]    = useState<TripMember[]>([]);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!expense) return;
    memberRepo.getMembersForTrip(expense.tripId).then(result => {
      if (isOk(result)) setMembers(result.value);
    });
  }, [expense, memberRepo]);

  useEffect(() => {
    const path = expense?.metadata?.receiptUrl;
    if (!path) return;
    getReceiptUrl(path).then(url => { if (url) setReceiptUrl(url); });
  }, [expense, getReceiptUrl]);

  const handleDelete = () => {
    if (!expense) return;
    void confirm('Delete this expense?', 'This cannot be undone.', 'Delete').then(async confirmed => {
      if (confirmed) {
        await storeApi.getState().removeExpense(expense.id, expense.tripId);
        router.back();
      }
    });
  };

  if (loading) {
    return (
      <ScreenWrapper>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary.default} size="large" />
        </View>
      </ScreenWrapper>
    );
  }

  if (error || !expense) {
    return (
      <ScreenWrapper>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: tokens.spacing.lg }}>
          <Text variant="body" color={colors.error.default} style={{ textAlign: 'center' }}>
            {error?.kind === 'NotFoundError' ? 'Expense not found.' : 'Could not load expense.'}
          </Text>
        </View>
      </ScreenWrapper>
    );
  }

  const payer      = members.find(m => m.userId === expense.paidByUserId);
  const payerName  = payer?.displayName ?? 'Unknown';
  const payerIndex = members.findIndex(m => m.userId === expense.paidByUserId);
  const payerPalette = personColors[Math.max(0, payerIndex) % personColors.length];

  return (
    <ScreenWrapper>
      <Stack.Screen
        options={{
          title: expense.description,
          headerRight: tripClosed ? undefined : () => (
            <Pressable
              onPress={() => router.push(`/expense/edit?id=${expense.id}`)}
              accessibilityRole="button"
              accessibilityLabel="Edit expense"
              hitSlop={8}
              style={{ paddingHorizontal: tokens.spacing.sm }}
            >
              <Ionicons name="pencil-outline" size={20} color="#e8e8f5" />
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={{ padding: tokens.spacing.md, paddingBottom: tokens.spacing.md + TAB_BAR_HEIGHT }}>

        {/* Expense header */}
        <Animated.View
          entering={Platform.OS !== 'web' ? SlideInDown.duration(400).springify() : undefined}
          style={{ marginBottom: tokens.spacing.lg }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: tokens.spacing.xs }}>
            <Text variant="heading1" style={{ flex: 1 }} numberOfLines={2}>
              {expense.description}
            </Text>
            <Badge label={expense.currency} />
          </View>
          <Text variant="heading2" color={colors.primary.default}>
            {formatCurrency(expense.totalAmountCents, expense.currency)}
          </Text>
          <Text variant="caption" color={colors.text.secondary} style={{ marginTop: tokens.spacing.xs }}>
            {expense.createdAt.toLocaleDateString(undefined, {
              weekday: 'short', month: 'short', day: 'numeric',
            })}
          </Text>
        </Animated.View>

        {/* Receipt image */}
        {receiptUrl && (
          <View style={{ marginBottom: tokens.spacing.md }}>
            <Text variant="caption" color={colors.text.secondary} style={{ marginBottom: tokens.spacing.xs }}>
              Receipt
            </Text>
            <Image
              source={{ uri: receiptUrl }}
              style={{
                width: '100%',
                height: 220,
                borderRadius: tokens.radius.card,
                backgroundColor: colors.surface,
              }}
              resizeMode="contain"
              accessibilityLabel="Receipt image"
            />
          </View>
        )}

        {/* Paid by */}
        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: tokens.radius.card,
            padding: tokens.spacing.md,
            marginBottom: tokens.spacing.md,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <Avatar
            initials={getInitials(payerName)}
            bg={payerPalette.bg}
            color={payerPalette.text}
            size="md"
          />
          <View style={{ marginLeft: tokens.spacing.sm }}>
            <Text variant="caption" color={colors.text.secondary}>
              Paid by
            </Text>
            <Text variant="body">{payerName}</Text>
          </View>
        </View>

        {/* Splits */}
        <View style={{ backgroundColor: colors.surface, borderRadius: tokens.radius.card, padding: tokens.spacing.md }}>
          <Text variant="label" color={colors.text.secondary} style={{ marginBottom: tokens.spacing.sm }}>
            Split ({expense.splits.length})
          </Text>

          {expense.splits.map((split, i) => {
            const member  = members.find(m => m.userId === split.userId);
            const name    = member?.displayName ?? split.userId;
            const mIndex  = members.findIndex(m => m.userId === split.userId);
            const palette = personColors[Math.max(0, mIndex) % personColors.length];
            const settled = !!split.settledAt;

            return (
              <View key={split.id}>
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: tokens.spacing.sm }}>
                  <Avatar initials={getInitials(name)} bg={palette.bg} color={palette.text} size="sm" />
                  <Text variant="body" style={{ flex: 1, marginLeft: tokens.spacing.sm }} numberOfLines={1}>
                    {name}
                  </Text>
                  {settled ? (
                    <Badge label="Settled" bg={colors.success.bg} color={colors.success.default} />
                  ) : (
                    <Text variant="label" color={colors.primary.default}>
                      {formatCurrency(split.amountOwedCents - split.amountPaidCents, expense.currency)}
                    </Text>
                  )}
                </View>
                {i < expense.splits.length - 1 && <Divider />}
              </View>
            );
          })}
        </View>

        {/* Delete — hidden for closed trips */}
        {!tripClosed && (
          <Pressable
            onPress={handleDelete}
            accessibilityRole="button"
            accessibilityLabel="Delete expense"
            style={({ pressed }) => ({
              alignItems: 'center',
              marginTop: tokens.spacing.xl,
              paddingVertical: tokens.spacing.sm,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Text variant="label" color={colors.error.default}>Delete expense</Text>
          </Pressable>
        )}
      </ScrollView>
    </ScreenWrapper>
  );
}
