import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, View, Pressable, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Text } from '../../components/ui/Text';
import { Button } from '../../components/ui/Button';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { useColors } from '../../theme/colors';
import { tokens } from '../../theme/tokens';
import { useService } from '../../core/di/ServiceContext';
import { ENTITLEMENT } from '../../core/di/tokens';
import type { EntitlementStatus } from '../../core/models/Entitlement';
import type { AppError } from '../../core/types/AppError';
import type { Result } from '../../core/types/Result';

interface PaywallSheetProps {
  visible: boolean;
  onClose: () => void;
  // Trip Pass is only offered when there's a specific trip in context —
  // TODO_monetization.md "Screen / UX touchpoints".
  tripId?: string;
  // Called after any successful purchase or restore, so the caller can
  // re-check whatever gate triggered this sheet.
  onPurchased?: () => void;
}

type PurchaseAction = 'trip_pass' | 'subscription' | 'restore';

const DISMISS_THRESHOLD = 100;
const DISMISS_VELOCITY  = 0.5;

// A user-cancelled purchase isn't a failure worth alarming over — see
// RevenueCatEntitlementService's isUserCancelledError, which maps it to this
// ValidationError shape.
function isCancelledPurchase(error: AppError): boolean {
  return error.kind === 'ValidationError' && error.field === 'purchase';
}

export function PaywallSheet({ visible, onClose, tripId, onPurchased }: PaywallSheetProps) {
  const { t } = useTranslation();
  const colors        = useColors();
  const entitlement    = useService(ENTITLEMENT);
  const translateY     = useSharedValue(0);

  const [status, setStatus] = useState<EntitlementStatus | null>(null);
  const [busy, setBusy]     = useState<PurchaseAction | null>(null);
  const [error, setError]   = useState<AppError | null>(null);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    translateY.value = 0;
    setError(null);
    setBusy(null);
    setStatus(entitlement.getStatus());
    void entitlement.refresh().then(() => {
      if (!cancelled) setStatus(entitlement.getStatus());
    });
    return () => { cancelled = true; };
    // translateY is a stable Reanimated shared-value handle — resetting .value here
    // doesn't need to re-run this effect, and including it risks a render loop if
    // any environment (e.g. a test mock) hands back a new object each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, entitlement]);

  const dragGesture = Gesture.Pan()
    .activeOffsetY(8)
    .onUpdate(({ translationY }) => {
      translateY.value = Math.max(0, translationY);
    })
    .onEnd(({ translationY, velocityY }) => {
      if (translationY > DISMISS_THRESHOLD || velocityY > DISMISS_VELOCITY * 1000) {
        translateY.value = withSpring(600, { damping: 20, stiffness: 180 }, () => runOnJS(onClose)());
      } else {
        translateY.value = withSpring(0, { damping: 20, stiffness: 300 });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  async function handlePurchase(
    action: PurchaseAction,
    run: () => Promise<Result<unknown, AppError>>,
    closeOnSuccess: boolean,
  ) {
    if (busy) return;
    setBusy(action);
    setError(null);

    const result = await run();
    setBusy(null);

    if (!result.ok) {
      if (isCancelledPurchase(result.error)) return;
      setError(result.error);
      return;
    }

    setStatus(entitlement.getStatus());
    onPurchased?.();
    if (closeOnSuccess) onClose();
  }

  const alreadyUnlocked = status !== null
    && (status.source === 'subscription' || status.source === 'override' || status.source === 'qa_build');
  const showTripPass = !!tripId && !alreadyUnlocked;
  const showPremium  = !alreadyUnlocked;
  const anyBusy       = busy !== null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} accessibilityViewIsModal>
      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFillObject}
          onPress={onClose}
          accessibilityLabel={t('monetization.paywall.close_label')}
        />

        <GestureDetector gesture={dragGesture}>
        <Animated.View
          style={[
            sheetStyle,
            { backgroundColor: colors.surface, borderTopLeftRadius: tokens.radius.card, borderTopRightRadius: tokens.radius.card },
          ]}
        >
          <View style={styles.handleContainer}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
          </View>

          <View style={{ paddingHorizontal: tokens.spacing.lg, paddingBottom: tokens.spacing.xxl }}>
            <Text variant="heading3" style={{ marginBottom: tokens.spacing.xs }}>
              {t('monetization.paywall.title')}
            </Text>
            <Text variant="body" color={colors.text.secondary} style={{ marginBottom: tokens.spacing.lg }}>
              {t('monetization.paywall.subtitle')}
            </Text>

            {alreadyUnlocked ? (
              <Text
                variant="body"
                color={colors.text.secondary}
                style={{ textAlign: 'center', paddingVertical: tokens.spacing.lg }}
              >
                {t('monetization.paywall.already_unlocked')}
              </Text>
            ) : (
              <>
                {showTripPass && (
                  <View
                    testID="paywall-trip-pass-card"
                    style={[styles.planCard, { borderColor: colors.borderMuted }]}
                  >
                    <Text variant="label">{t('monetization.paywall.trip_pass.title')}</Text>
                    <Text variant="heading3" style={{ marginVertical: tokens.spacing.xs }}>
                      {t('monetization.paywall.trip_pass.price')}
                    </Text>
                    <Text variant="caption" color={colors.text.secondary} style={{ marginBottom: tokens.spacing.sm }}>
                      {t('monetization.paywall.trip_pass.description')}
                    </Text>
                    <Button
                      testID="paywall-trip-pass-button"
                      label={t('monetization.paywall.trip_pass.button')}
                      loading={busy === 'trip_pass'}
                      disabled={anyBusy && busy !== 'trip_pass'}
                      onPress={() => void handlePurchase('trip_pass', () => entitlement.purchaseTripPass(tripId!), true)}
                    />
                  </View>
                )}

                {showPremium && (
                  <View
                    testID="paywall-premium-card"
                    style={[styles.planCard, { borderColor: colors.borderMuted }]}
                  >
                    <Text variant="label">{t('monetization.paywall.premium.title')}</Text>
                    <Text variant="heading3" style={{ marginVertical: tokens.spacing.xs }}>
                      {t('monetization.paywall.premium.price')}
                    </Text>
                    <Text variant="caption" color={colors.text.secondary} style={{ marginBottom: tokens.spacing.sm }}>
                      {t('monetization.paywall.premium.description')}
                    </Text>
                    <Button
                      testID="paywall-premium-button"
                      label={t('monetization.paywall.premium.button')}
                      loading={busy === 'subscription'}
                      disabled={anyBusy && busy !== 'subscription'}
                      onPress={() => void handlePurchase('subscription', () => entitlement.purchaseSubscription(), true)}
                    />
                  </View>
                )}
              </>
            )}

            <ErrorBanner error={error} fallback={t('monetization.paywall.error_generic')} style={{ marginTop: tokens.spacing.md }} />

            <Pressable
              onPress={() => void handlePurchase('restore', () => entitlement.restorePurchases(), false)}
              disabled={anyBusy}
              accessibilityRole="button"
              accessibilityLabel={t('monetization.paywall.restore')}
              style={({ pressed }) => ({
                marginTop:       tokens.spacing.md,
                alignItems:      'center',
                paddingVertical: tokens.spacing.sm,
                opacity:         pressed || anyBusy ? 0.7 : 1,
              })}
            >
              <Text variant="label" color={colors.primary.default}>
                {busy === 'restore' ? t('monetization.paywall.confirming') : t('monetization.paywall.restore')}
              </Text>
            </Pressable>

            <Pressable
              onPress={onClose}
              disabled={anyBusy}
              accessibilityRole="button"
              accessibilityLabel={t('monetization.paywall.cancel')}
              style={({ pressed }) => ({
                alignItems:      'center',
                paddingVertical: tokens.spacing.sm,
                opacity:         pressed ? 0.7 : 1,
              })}
            >
              <Text variant="label" color={colors.text.secondary}>{t('monetization.paywall.cancel')}</Text>
            </Pressable>
          </View>
        </Animated.View>
        </GestureDetector>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex:            1,
    justifyContent:  'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  handleContainer: {
    alignItems:    'center',
    paddingTop:    tokens.spacing.sm,
    paddingBottom: tokens.spacing.xs,
  },
  handle: {
    width:        40,
    height:       4,
    borderRadius: 2,
  },
  planCard: {
    borderWidth:     1,
    borderRadius:    tokens.radius.md,
    padding:         tokens.spacing.md,
    marginBottom:    tokens.spacing.md,
  },
});
