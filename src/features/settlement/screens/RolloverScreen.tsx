import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  FlatList,
  Pressable,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { z } from 'zod';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '../../../components/ui/ScreenWrapper';
import { Button } from '../../../components/ui/Button';
import { ErrorBanner } from '../../../components/ui/ErrorBanner';
import { Text } from '../../../components/ui/Text';
import { useSettlement } from '../hooks/useSettlement';
import { useRollover } from '../hooks/useRollover';
import { formatCurrency } from '../../../core/utils/formatCurrency';
import { useColors } from '../../../theme/colors';
import { tokens } from '../../../theme/tokens';
import type { Trip } from '../../../core/models/Trip';
import type { TripMember } from '../../../core/models/TripMember';
import type { RolloverDebtSeed } from '../../../core/logic/rollover';

const rolloverParamsSchema = z.object({
  tripId: z.string().min(1),
});

// ── Public entry point (param guard) ─────────────────────────────────────────

export function RolloverScreen() {
  const { t } = useTranslation();
  const raw    = useLocalSearchParams();
  const parsed = rolloverParamsSchema.safeParse(raw);
  const colors = useColors();

  if (!parsed.success) {
    return (
      <ScreenWrapper>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: tokens.spacing.lg }}>
          <Text variant="body" color={colors.error.default} style={{ textAlign: 'center' }}>
            {t('common.error_invalid_params')}
          </Text>
        </View>
      </ScreenWrapper>
    );
  }

  return <RolloverScreenContent tripId={parsed.data.tripId} />;
}

// ── Inner content ─────────────────────────────────────────────────────────────

function RolloverScreenContent({ tripId }: { tripId: string }) {
  const { t } = useTranslation();
  const colors = useColors();
  const router = useRouter();

  const { settlements } = useSettlement(tripId);

  const {
    step,
    availableTrips,
    targetTripId,
    targetMembers,
    manualMatch,
    seeds,
    selectedIndices,
    loading,
    error,
    selectTargetTrip,
    overrideMatch,
    removeMatch,
    toggleSeedSelection,
    goNext,
    goBack,
    confirm,
  } = useRollover(tripId, settlements);

  const handleConfirm = useCallback(async () => {
    const ok = await confirm();
    if (ok) router.back();
  }, [confirm, router]);

  const handleBack = useCallback(() => {
    if (step === 'pick-trip') {
      router.back();
    } else {
      goBack();
    }
  }, [step, goBack, router]);

  const stepIndex = { 'pick-trip': 1, 'match-participants': 2, 'review-debts': 3, 'confirm': 4 }[step];

  const screenOptions = useMemo(() => ({
    title:      t('settlement.rollover.title'),
    headerLeft: () => (
      <Pressable onPress={handleBack} hitSlop={8}>
        <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
      </Pressable>
    ),
  }), [handleBack, colors.text.primary, t]);

  return (
    <ScreenWrapper>
      <Stack.Screen options={screenOptions} />

      {/* Step indicator */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: tokens.spacing.sm }}>
        {[1, 2, 3, 4].map((n) => (
          <View
            key={n}
            style={{
              width:           n === stepIndex ? 24 : 8,
              height:          8,
              borderRadius:    4,
              backgroundColor: n === stepIndex ? colors.primary.default : colors.border,
            }}
          />
        ))}
      </View>

      <ErrorBanner error={error} style={{ margin: tokens.spacing.md }} />

      {step === 'pick-trip'           && <PickTripStep availableTrips={availableTrips} onSelect={selectTargetTrip} />}
      {step === 'match-participants'  && manualMatch && (
        <MatchParticipantsStep
          matched={manualMatch.matched}
          unmatched={manualMatch.unmatched}
          targetMembers={targetMembers}
          onOverride={overrideMatch}
          onRemove={removeMatch}
          onNext={goNext}
        />
      )}
      {step === 'review-debts'        && (
        <ReviewDebtsStep
          seeds={seeds}
          selectedIndices={selectedIndices}
          onToggle={toggleSeedSelection}
          onNext={goNext}
        />
      )}
      {step === 'confirm'             && (
        <ConfirmStep
          seeds={seeds}
          selectedIndices={selectedIndices}
          targetTripId={targetTripId}
          loading={loading}
          onConfirm={handleConfirm}
        />
      )}
    </ScreenWrapper>
  );
}

// ── Step 1 — Pick Trip ────────────────────────────────────────────────────────

function PickTripStep({
  availableTrips,
  onSelect,
}: {
  availableTrips: Trip[];
  onSelect: (tripId: string) => void;
}) {
  const { t } = useTranslation();
  const colors = useColors();

  if (availableTrips.length === 0) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: tokens.spacing.xl }}>
        <Text variant="body" color={colors.text.secondary} style={{ textAlign: 'center' }}>
          {t('settlement.rollover.no_trips')}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Text variant="label" color={colors.text.secondary} style={{ paddingHorizontal: tokens.spacing.md, paddingBottom: tokens.spacing.sm }}>
        {t('settlement.rollover.pick_trip_label')}
      </Text>
      <FlatList
        data={availableTrips}
        keyExtractor={(t) => t.id}
        renderItem={({ item }) => (
          <Pressable
            testID={`trip-row-${item.id}`}
            onPress={() => onSelect(item.id)}
            style={({ pressed }) => ({
              flexDirection:   'row',
              alignItems:      'center',
              justifyContent:  'space-between',
              padding:         tokens.spacing.md,
              marginHorizontal: tokens.spacing.md,
              marginBottom:    tokens.spacing.xs,
              backgroundColor: pressed ? colors.surface : colors.surface,
              borderRadius:    tokens.radius.card,
            })}
          >
            <View>
              <Text variant="body">{item.name}</Text>
              <Text variant="caption" color={colors.text.secondary}>{item.currency}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.text.tertiary} />
          </Pressable>
        )}
      />
    </View>
  );
}

// ── Step 2 — Match Participants ───────────────────────────────────────────────

function MatchParticipantsStep({
  matched,
  unmatched,
  targetMembers,
  onOverride,
  onRemove,
  onNext,
}: {
  matched: Map<string, string>;
  unmatched: TripMember[];
  targetMembers: TripMember[];
  onOverride: (sourceUserId: string, targetUserId: string) => void;
  onRemove: (sourceUserId: string) => void;
  onNext: () => void;
}) {
  const { t } = useTranslation();
  const colors = useColors();
  const matchedEntries = [...matched.entries()];

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={matchedEntries}
        keyExtractor={([src]) => src}
        ListHeaderComponent={
          <>
            {matchedEntries.length > 0 && (
              <Text variant="label" color={colors.text.secondary} style={{ paddingHorizontal: tokens.spacing.md, paddingTop: tokens.spacing.sm, paddingBottom: tokens.spacing.xs }}>
                {t('settlement.rollover.matched_label', { count: matchedEntries.length })}
              </Text>
            )}
          </>
        }
        renderItem={({ item: [src, tgt] }) => {
          const tgtMember = targetMembers.find(m => m.userId === tgt);
          return (
            <View
              style={{
                flexDirection:  'row',
                alignItems:     'center',
                justifyContent: 'space-between',
                paddingHorizontal: tokens.spacing.md,
                paddingVertical:   tokens.spacing.sm,
              }}
            >
              <Text variant="body">{src}</Text>
              <Ionicons name="arrow-forward" size={14} color={colors.text.tertiary} style={{ marginHorizontal: tokens.spacing.xs }} />
              <Text variant="body">{tgtMember?.displayName ?? tgt}</Text>
              <Pressable onPress={() => onRemove(src)} hitSlop={8} style={{ marginLeft: tokens.spacing.sm }}>
                <Ionicons name="close-circle-outline" size={18} color={colors.text.tertiary} />
              </Pressable>
            </View>
          );
        }}
        ListFooterComponent={
          unmatched.length > 0 ? (
            <View>
              <Text variant="label" color={colors.text.secondary} style={{ paddingHorizontal: tokens.spacing.md, paddingTop: tokens.spacing.md, paddingBottom: tokens.spacing.xs }}>
                {t('settlement.rollover.unmatched_label', { count: unmatched.length })}
              </Text>
              {unmatched.map((src) => (
                <View key={src.userId} style={{ marginHorizontal: tokens.spacing.md, marginBottom: tokens.spacing.xs }}>
                  <Text variant="body" style={{ paddingBottom: tokens.spacing.xs }}>{src.displayName}</Text>
                  {targetMembers.map((tgt) => (
                    <Pressable
                      key={tgt.userId}
                      testID={`override-${src.userId}-${tgt.userId}`}
                      onPress={() => onOverride(src.userId, tgt.userId)}
                      style={({ pressed }) => ({
                        paddingHorizontal: tokens.spacing.sm,
                        paddingVertical:   tokens.spacing.xs,
                        backgroundColor:   pressed ? colors.surface : colors.surface,
                        borderRadius:      tokens.radius.sm,
                        marginBottom:      tokens.spacing.xs,
                      })}
                    >
                      <Text variant="caption" color={colors.primary.default}>{tgt.displayName}</Text>
                    </Pressable>
                  ))}
                </View>
              ))}
            </View>
          ) : null
        }
      />
      <View style={{ padding: tokens.spacing.md }}>
        <Pressable
          testID="next-to-review"
          onPress={onNext}
          style={({ pressed }) => ({
            alignItems:      'center',
            padding:         tokens.spacing.md,
            backgroundColor: pressed ? colors.primary.dim : colors.primary.default,
            borderRadius:    tokens.radius.pill,
          })}
        >
          <Text variant="label" color={colors.text.inverse}>{t('settlement.rollover.review_button')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ── Step 3 — Review Debts ─────────────────────────────────────────────────────

function ReviewDebtsStep({
  seeds,
  selectedIndices,
  onToggle,
  onNext,
}: {
  seeds: RolloverDebtSeed[];
  selectedIndices: Set<number>;
  onToggle: (index: number) => void;
  onNext: () => void;
}) {
  const { t } = useTranslation();
  const colors = useColors();

  if (seeds.length === 0) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: tokens.spacing.xl }}>
        <Text variant="body" color={colors.text.secondary} style={{ textAlign: 'center' }}>
          {t('settlement.rollover.no_debts')}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Text variant="label" color={colors.text.secondary} style={{ paddingHorizontal: tokens.spacing.md, paddingBottom: tokens.spacing.sm }}>
        {t('settlement.rollover.review_label')}
      </Text>
      <FlatList
        data={seeds}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item, index }) => {
          const selected = selectedIndices.has(index);
          return (
            <Pressable
              testID={`seed-row-${index}`}
              onPress={() => onToggle(index)}
              style={{
                flexDirection:   'row',
                alignItems:      'center',
                paddingHorizontal: tokens.spacing.md,
                paddingVertical:   tokens.spacing.sm,
                opacity:         selected ? 1 : 0.4,
              }}
            >
              <Ionicons
                name={selected ? 'checkbox' : 'square-outline'}
                size={20}
                color={selected ? colors.primary.default : colors.text.tertiary}
                style={{ marginRight: tokens.spacing.sm }}
              />
              <View style={{ flex: 1 }}>
                <Text variant="body">
                  {item.fromUserId} → {item.toUserId}
                </Text>
              </View>
              <Text variant="body">
                {formatCurrency(item.amountCents, item.currency)}
              </Text>
            </Pressable>
          );
        }}
      />
      <View style={{ padding: tokens.spacing.md }}>
        <Pressable
          testID="next-to-confirm"
          onPress={onNext}
          style={({ pressed }) => ({
            alignItems:      'center',
            padding:         tokens.spacing.md,
            backgroundColor: pressed ? colors.primary.dim : colors.primary.default,
            borderRadius:    tokens.radius.pill,
          })}
        >
          <Text variant="label" color={colors.text.inverse}>{t('settlement.rollover.continue_button')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ── Step 4 — Confirm ──────────────────────────────────────────────────────────

function ConfirmStep({
  seeds,
  selectedIndices,
  targetTripId,
  loading,
  onConfirm,
}: {
  seeds: RolloverDebtSeed[];
  selectedIndices: Set<number>;
  targetTripId: string | null;
  loading: boolean;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const colors  = useColors();
  const chosen  = seeds.filter((_, i) => selectedIndices.has(i));
  const total   = chosen.reduce((sum, s) => sum + s.amountCents, 0);
  const currency = chosen[0]?.currency ?? '';

  return (
    <View style={{ flex: 1, padding: tokens.spacing.md }}>
      <View style={{
        backgroundColor: colors.surface,
        borderRadius:    tokens.radius.card,
        padding:         tokens.spacing.md,
        marginBottom:    tokens.spacing.md,
        ...tokens.shadow.sm,
      }}>
        <Text variant="label" color={colors.text.secondary} style={{ marginBottom: tokens.spacing.xs }}>
          {t('settlement.rollover.confirm_target_label')}
        </Text>
        <Text variant="body">{targetTripId ?? '—'}</Text>
        <Text variant="label" color={colors.text.secondary} style={{ marginTop: tokens.spacing.sm }}>
          {t('settlement.rollover.debt_count', { count: chosen.length })}
          {currency ? ` · ${formatCurrency(total, currency)}` : ''}
        </Text>
      </View>

      <Button
        testID="confirm-rollover"
        label={t('settlement.rollover.confirm_button')}
        onPress={onConfirm}
        disabled={chosen.length === 0}
        loading={loading}
      />
    </View>
  );
}
