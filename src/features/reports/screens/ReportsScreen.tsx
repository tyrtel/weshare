import React, { useState } from 'react';
import { View, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '../../../components/ui/ScreenWrapper';
import { Text } from '../../../components/ui/Text';
import { useColors } from '../../../theme/colors';
import { tokens } from '../../../theme/tokens';
import { useTrips } from '../../trips/hooks/useTrips';
import { useGroups } from '../../groups/hooks/useGroups';
import { useGenerateReport } from '../hooks/useGenerateReport';
import { PaywallSheet } from '../../../shared/components/PaywallSheet';
import type { Trip } from '../../../core/models/Trip';
import type { Group } from '../../../core/models/Group';

function ReportRow({ title, subtitle, busy, disabled, onGenerate }: {
  title: string;
  subtitle?: string;
  busy: boolean;
  disabled: boolean;
  onGenerate: () => void;
}) {
  const colors = useColors();
  const { t } = useTranslation();
  return (
    <View
      style={{
        flexDirection: 'row', alignItems: 'center',
        paddingVertical: tokens.spacing.md, paddingHorizontal: tokens.spacing.md,
        backgroundColor: colors.surface, borderRadius: tokens.radius.card,
        marginBottom: tokens.spacing.sm, ...tokens.shadow.sm,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text variant="label" color={colors.text.primary} numberOfLines={1}>{title}</Text>
        {subtitle ? (
          <Text variant="caption" color={colors.text.tertiary} style={{ marginTop: 2 }}>{subtitle}</Text>
        ) : null}
      </View>
      <Pressable
        onPress={onGenerate}
        disabled={disabled || busy}
        accessibilityRole="button"
        accessibilityLabel={t('reports.generate_label', { name: title })}
        style={({ pressed }) => ({
          flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.xs,
          backgroundColor: colors.primary.default,
          borderRadius: tokens.radius.pill,
          paddingVertical: tokens.spacing.xs, paddingHorizontal: tokens.spacing.md,
          opacity: disabled || busy ? 0.6 : pressed ? 0.8 : 1,
        })}
      >
        {busy ? (
          <ActivityIndicator size="small" color={colors.text.inverse} />
        ) : (
          <>
            <Ionicons name="document-text-outline" size={14} color={colors.text.inverse} />
            <Text variant="caption" color={colors.text.inverse}>{t('reports.generate_button')}</Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

function MonthStepper({ month, onChange }: { month: Date; onChange: (m: Date) => void }) {
  const { t } = useTranslation();
  const colors = useColors();
  const label = month.toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
  const shift = (delta: number) => onChange(new Date(month.getFullYear(), month.getMonth() + delta, 1));

  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      marginBottom: tokens.spacing.sm,
    }}>
      <Pressable onPress={() => shift(-1)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('reports.groups.prev_month_label')}>
        <Ionicons name="chevron-back" size={20} color={colors.text.secondary} />
      </Pressable>
      <Text variant="body" color={colors.text.primary} style={{ fontWeight: '600' }}>{label}</Text>
      <Pressable onPress={() => shift(1)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('reports.groups.next_month_label')}>
        <Ionicons name="chevron-forward" size={20} color={colors.text.secondary} />
      </Pressable>
    </View>
  );
}

export function ReportsScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const { trips } = useTrips();
  const { groups } = useGroups();
  const {
    generating, error, remaining,
    limitReached, limitReachedTripId, clearLimitReached,
    remainingFreeExports, hasFullAccess,
    generateTripReport, generateGroupReport,
  } = useGenerateReport();

  const [month, setMonth]       = useState(() => new Date());
  const [activeId, setActiveId] = useState<string | null>(null);

  const atLimit = remaining !== null && remaining <= 0;

  const handleTrip = async (trip: Trip) => {
    setActiveId(trip.id);
    await generateTripReport(trip.id);
    setActiveId(null);
  };

  const handleGroup = async (group: Group) => {
    setActiveId(group.id);
    await generateGroupReport(group.id, month);
    setActiveId(null);
  };

  return (
    <ScreenWrapper>
      <ScrollView
        contentContainerStyle={{ padding: tokens.spacing.md, paddingBottom: tokens.spacing.xxl }}
        showsVerticalScrollIndicator={false}
      >
        <Text variant="heading1" style={{ marginBottom: tokens.spacing.xs }}>{t('reports.screen.title')}</Text>
        <Text variant="caption" color={colors.text.tertiary} style={{ marginBottom: tokens.spacing.xs }}>
          {remaining !== null ? t('reports.screen.remaining', { count: remaining }) : t('reports.screen.limit_note')}
        </Text>
        {!hasFullAccess && (
          <Text variant="caption" color={colors.text.tertiary} style={{ marginBottom: tokens.spacing.md }}>
            {t('reports.screen.remaining_free', { count: remainingFreeExports })}
          </Text>
        )}

        {error ? (
          <View style={{
            backgroundColor: colors.error.bg, borderRadius: tokens.radius.md,
            padding: tokens.spacing.sm, marginBottom: tokens.spacing.md,
          }}>
            <Text variant="caption" color={colors.error.default}>{error}</Text>
          </View>
        ) : null}

        <Text variant="label" color={colors.text.secondary} style={{ marginBottom: tokens.spacing.sm }}>
          {t('reports.trips.section_title')}
        </Text>
        {trips.length === 0 ? (
          <Text variant="caption" color={colors.text.tertiary} style={{ marginBottom: tokens.spacing.lg }}>
            {t('reports.trips.empty')}
          </Text>
        ) : trips.map(trip => (
          <ReportRow
            key={trip.id}
            title={trip.name}
            busy={generating && activeId === trip.id}
            disabled={atLimit || (generating && activeId !== trip.id)}
            onGenerate={() => void handleTrip(trip)}
          />
        ))}

        <View style={{ height: tokens.spacing.lg }} />

        <Text variant="label" color={colors.text.secondary} style={{ marginBottom: tokens.spacing.sm }}>
          {t('reports.groups.section_title')}
        </Text>
        {groups.length > 0 && <MonthStepper month={month} onChange={setMonth} />}
        {groups.length === 0 ? (
          <Text variant="caption" color={colors.text.tertiary}>{t('reports.groups.empty')}</Text>
        ) : groups.map(group => (
          <ReportRow
            key={group.id}
            title={group.name}
            busy={generating && activeId === group.id}
            disabled={atLimit || (generating && activeId !== group.id)}
            onGenerate={() => void handleGroup(group)}
          />
        ))}
      </ScrollView>
      <PaywallSheet
        visible={limitReached}
        onClose={clearLimitReached}
        tripId={limitReachedTripId}
        onPurchased={clearLimitReached}
      />
    </ScreenWrapper>
  );
}
