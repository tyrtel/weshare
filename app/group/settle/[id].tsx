import React, { useState } from 'react';
import { View, ScrollView, Pressable, Alert, ActivityIndicator, Linking } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '../../../src/components/ui/ScreenWrapper';
import { TAB_BAR_HEIGHT } from '../../../src/components/ui/UniversalTabBar';
import { Text } from '../../../src/components/ui/Text';
import { Card } from '../../../src/components/ui/Card';
import { Avatar } from '../../../src/components/ui';
import { ErrorBanner } from '../../../src/components/ui/ErrorBanner';
import { RecordPaymentSheet } from '../../../src/features/settlement/components/RecordPaymentSheet';
import { useGroupDetail } from '../../../src/features/groups/hooks/useGroupDetail';
import { useSettleAllGroupDebts } from '../../../src/features/groups/hooks/useSettleAllGroupDebts';
import { useService } from '../../../src/core/di/ServiceContext';
import { PAYMENT } from '../../../src/core/di/tokens';
import { useColors } from '../../../src/theme/colors';
import { personColors } from '../../../src/theme/colors';
import { tokens } from '../../../src/theme/tokens';
import { formatCurrency } from '../../../src/core/utils/formatCurrency';
import type { Settlement } from '../../../src/core/models/Settlement';

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export default function GroupSettlementScreen() {
  const { t }          = useTranslation();
  const colors         = useColors();
  const router         = useRouter();
  const { id }         = useLocalSearchParams<{ id: string }>();
  const paymentService = useService(PAYMENT);

  const { group, settlements, memberBalances, recordPayment, recording } = useGroupDetail(id);
  const { settleAll, loading, error }          = useSettleAllGroupDebts(id, settlements);
  const [recordTarget, setRecordTarget] = useState<Settlement | null>(null);

  const handleWeroPay = async (phone: string, amountCents: number, currency: string, toName: string) => {
    const url = paymentService.buildPaymentLink('wero', amountCents, currency, phone);
    const canOpen = await Linking.canOpenURL(url).catch(() => false);
    if (canOpen) {
      await Linking.openURL(url).catch(() => undefined);
    } else {
      Alert.alert('Wero', t('groups.settle.wero_not_installed', { name: toName }));
    }
  };

  if (!group) return null;

  const memberMap = new Map(group.members.map((m, i) => [m.userId, { member: m, index: i }]));
  const hasDebts  = settlements.length > 0;

  const handleSettleAll = () => {
    Alert.alert(
      t('groups.settle.confirm_title'),
      t('groups.settle.confirm_message'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text:  t('groups.settle.confirm_action'),
          style: 'destructive',
          onPress: async () => {
            const ok = await settleAll();
            if (ok) router.back();
          },
        },
      ],
    );
  };

  return (
    <ScreenWrapper>
      <Stack.Screen options={{ title: t('groups.settle.title') }} />
      <ScrollView
        contentContainerStyle={{ padding: tokens.spacing.md, paddingBottom: tokens.spacing.md + TAB_BAR_HEIGHT }}
        showsVerticalScrollIndicator={false}
      >
        <Text variant="heading2" style={{ marginBottom: tokens.spacing.xs }}>{group.name}</Text>
        <Text variant="caption" color={colors.text.secondary} style={{ marginBottom: tokens.spacing.lg }}>
          {t('groups.settle.subtitle')}
        </Text>

        {/* Per-member balances */}
        <Text
          variant="label"
          color={colors.text.secondary}
          style={{ textTransform: 'uppercase', letterSpacing: 0.8, fontSize: 11, marginBottom: tokens.spacing.sm }}
        >
          {t('groups.settle.balances_section')}
        </Text>
        <View style={{ backgroundColor: colors.surface, borderRadius: tokens.radius.card, marginBottom: tokens.spacing.lg, overflow: 'hidden' }}>
          {memberBalances.map((b, i) => {
            const info    = memberMap.get(b.userId);
            const name    = info?.member.displayName ?? b.userId;
            const palette = personColors[(info?.index ?? i) % personColors.length];
            const isOwed  = b.balanceCents > 0;
            const isEven  = b.balanceCents === 0;
            return (
              <View
                key={b.userId}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: tokens.spacing.md,
                  borderBottomWidth: i < memberBalances.length - 1 ? 1 : 0,
                  borderBottomColor: colors.borderMuted,
                }}
              >
                <Avatar initials={getInitials(name)} bg={palette.bg} url={info?.member.avatarUrl} size="sm" />
                <Text variant="body" style={{ flex: 1, marginLeft: tokens.spacing.sm }}>{name}</Text>
                <Text
                  variant="label"
                  color={isEven ? colors.text.tertiary : isOwed ? colors.success.default : colors.error.default}
                >
                  {isEven
                    ? t('groups.settle.even')
                    : isOwed
                    ? `+${formatCurrency(b.balanceCents, group.currency)}`
                    : `−${formatCurrency(-b.balanceCents, group.currency)}`}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Suggested transfers */}
        <Text
          variant="label"
          color={colors.text.secondary}
          style={{ textTransform: 'uppercase', letterSpacing: 0.8, fontSize: 11, marginBottom: tokens.spacing.sm }}
        >
          {t('groups.settle.transfers_section')}
        </Text>

        {hasDebts ? (
          <>
            {settlements.map((s, i) => {
              const fromInfo  = memberMap.get(s.fromUserId);
              const toInfo    = memberMap.get(s.toUserId);
              const fromName  = fromInfo?.member.displayName ?? s.fromUserId;
              const toName    = toInfo?.member.displayName ?? s.toUserId;
              const fromPalette = personColors[(fromInfo?.index ?? 0) % personColors.length];
              const toPalette   = personColors[(toInfo?.index ?? 1) % personColors.length];
              const toPhone = toInfo?.member.phone;
              return (
                <Card key={i} style={{ marginBottom: tokens.spacing.sm }}>
                  <Pressable
                    onPress={() =>
                      router.push({
                        pathname: `/group/settle/audit/${group.id}` as never,
                        params: { groupId: group.id, fromUserId: s.fromUserId, toUserId: s.toUserId, fromName, toName },
                      })
                    }
                    accessibilityRole="button"
                    accessibilityLabel={t('settlement.row.history_label', { from: fromName, to: toName })}
                    style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', opacity: pressed ? 0.85 : 1 })}
                  >
                    <Avatar initials={getInitials(fromName)} bg={fromPalette.bg} url={fromInfo?.member.avatarUrl} size="sm" />
                    <Ionicons name="arrow-forward" size={16} color={colors.text.tertiary} style={{ marginHorizontal: tokens.spacing.sm }} />
                    <Avatar initials={getInitials(toName)} bg={toPalette.bg} url={toInfo?.member.avatarUrl} size="sm" />
                    <View style={{ flex: 1, marginLeft: tokens.spacing.sm }}>
                      <Text variant="body">{`${fromName} → ${toName}`}</Text>
                    </View>
                    <Text variant="label" color={colors.primary.default}>
                      {formatCurrency(s.amountCents, s.currency)}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.text.tertiary} style={{ marginLeft: tokens.spacing.xs }} />
                  </Pressable>
                  <View
                    style={{
                      flexDirection: 'row',
                      marginTop: tokens.spacing.sm,
                      paddingTop: tokens.spacing.sm,
                      borderTopWidth: 1,
                      borderTopColor: colors.borderMuted,
                      gap: tokens.spacing.lg,
                    }}
                  >
                    <Pressable
                      onPress={() => setRecordTarget(s)}
                      accessibilityRole="button"
                      accessibilityLabel={t('settlement.row.record_payment_label', { from: fromName, to: toName })}
                      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.xs, opacity: pressed ? 0.7 : 1 })}
                    >
                      <Ionicons name="add-circle-outline" size={16} color={colors.primary.default} />
                      <Text variant="label" color={colors.primary.default}>
                        {t('settlement.row.record_payment')}
                      </Text>
                    </Pressable>
                    {toPhone != null && (
                      <Pressable
                        onPress={() => void handleWeroPay(toPhone, s.amountCents, s.currency, toName)}
                        accessibilityRole="button"
                        accessibilityLabel={t('groups.settle.pay_with_wero')}
                        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.xs, opacity: pressed ? 0.7 : 1 })}
                      >
                        <Ionicons name="wallet-outline" size={16} color={colors.primary.default} />
                        <Text variant="label" color={colors.primary.default}>
                          {t('groups.settle.pay_with_wero')}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                </Card>
              );
            })}

            <ErrorBanner error={error} fallback={t('groups.settle.settle_all_error')} style={{ marginBottom: tokens.spacing.md }} />

            {/* Mark everything settled */}
            <Pressable
              onPress={handleSettleAll}
              disabled={loading}
              accessibilityRole="button"
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: tokens.spacing.sm,
                marginTop: tokens.spacing.md,
                paddingVertical: tokens.spacing.md,
                borderRadius: tokens.radius.card,
                backgroundColor: colors.success.bg,
                opacity: loading || pressed ? 0.7 : 1,
              })}
            >
              {loading
                ? <ActivityIndicator size="small" color={colors.success.default} />
                : <Ionicons name="checkmark-done-circle-outline" size={22} color={colors.success.default} />}
              <Text variant="label" color={colors.success.default}>
                {t('groups.settle.settle_all_button')}
              </Text>
            </Pressable>
          </>
        ) : (
          <View style={{ alignItems: 'center', paddingVertical: tokens.spacing.xl }}>
            <Ionicons name="checkmark-circle-outline" size={40} color={colors.success.default} />
            <Text variant="body" color={colors.text.secondary} style={{ marginTop: tokens.spacing.sm, textAlign: 'center' }}>
              {t('groups.settle.all_settled')}
            </Text>
          </View>
        )}
      </ScrollView>

      {recordTarget && (
        <RecordPaymentSheet
          visible
          fromLabel={memberMap.get(recordTarget.fromUserId)?.member.displayName ?? recordTarget.fromUserId}
          toLabel={memberMap.get(recordTarget.toUserId)?.member.displayName ?? recordTarget.toUserId}
          defaultAmountCents={recordTarget.amountCents}
          currency={recordTarget.currency}
          busy={recording}
          onClose={() => setRecordTarget(null)}
          onConfirm={(amountCents) => {
            void recordPayment(recordTarget.fromUserId, recordTarget.toUserId, amountCents, recordTarget.currency)
              .then(() => setRecordTarget(null));
          }}
        />
      )}
    </ScreenWrapper>
  );
}
