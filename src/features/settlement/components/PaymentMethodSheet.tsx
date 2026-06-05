import React, { useRef, useEffect, useState } from 'react';
import { Modal, View, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Text } from '../../../components/ui/Text';
import { useColors } from '../../../theme/colors';
import { tokens } from '../../../theme/tokens';
import { useService } from '../../../core/di/ServiceContext';
import { PAYMENT_REGISTRY, SPLIT_REQUEST_REPO } from '../../../core/di/tokens';
import type { IPaymentMethod } from '../../../core/interfaces/IPaymentMethod';
import type { SplitRequest } from '../../../core/models/SplitRequest';

interface PaymentMethodSheetProps {
  visible:           boolean;
  tripId:            string;
  payerUserId:       string;
  requesterUserId:   string;
  amountCents:       number;
  currency:          string;
  recipientName:     string;
  onClose:           () => void;
  onPaymentLaunched: (req: SplitRequest) => void;
}

const DISMISS_THRESHOLD = 100;
const DISMISS_VELOCITY  = 0.5;

export function PaymentMethodSheet({
  visible,
  tripId,
  payerUserId,
  requesterUserId,
  amountCents,
  currency,
  recipientName,
  onClose,
  onPaymentLaunched,
}: PaymentMethodSheetProps) {
  const colors           = useColors();
  const router           = useRouter();
  const registry         = useService(PAYMENT_REGISTRY);
  const splitRequestRepo = useService(SPLIT_REQUEST_REPO);
  const translateY       = useSharedValue(0);

  const [availableMethods, setAvailableMethods] = useState<IPaymentMethod[] | null>(null);
  const [launching, setLaunching]               = useState(false);

  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!visible) return;
    translateY.value = 0;
    setAvailableMethods(null);
    void registry.getAvailable().then(setAvailableMethods);
  }, [visible, translateY, registry]);

  const dragGesture = Gesture.Pan()
    .activeOffsetY(8)
    .onUpdate(({ translationY }) => {
      translateY.value = Math.max(0, translationY);
    })
    .onEnd(({ translationY, velocityY }) => {
      if (translationY > DISMISS_THRESHOLD || velocityY > DISMISS_VELOCITY * 1000) {
        translateY.value = withSpring(
          600,
          { damping: 20, stiffness: 180 },
          () => runOnJS(onCloseRef.current)(),
        );
      } else {
        translateY.value = withSpring(0, { damping: 20, stiffness: 300 });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const isAmountValid = Number.isFinite(amountCents) && amountCents > 0;

  const handlePay = async (method: IPaymentMethod) => {
    if (launching || !isAmountValid) return;
    setLaunching(true);

    try {
      const navigate = (path: string, navParams: Record<string, string>) => {
        onClose();
        router.push({ pathname: path as never, params: navParams });
      };

      const req = await method.launch(
        {
          tripId,
          payerUserId,
          requesterUserId,
          amountCents,
          currency,
          recipientName,
          note:     `ouiShare payment to ${recipientName}`,
          navigate,
        },
        splitRequestRepo,
      );

      if (req !== null) {
        onPaymentLaunched(req);
        onClose();
      }
      // req === null: navigate was already called (e.g. OB), sheet already closed.
    } finally {
      setLaunching(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFillObject}
          onPress={onClose}
          accessibilityLabel="Close payment options"
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
              Pay via…
            </Text>
            <Text
              variant="body"
              color={colors.text.secondary}
              style={{ marginBottom: tokens.spacing.lg }}
            >
              Choose how to send payment to {recipientName}.
            </Text>

            {!isAmountValid ? (
              <View style={{ paddingVertical: tokens.spacing.lg, alignItems: 'center' }}>
                <Text variant="body" color={colors.error.default} style={{ textAlign: 'center' }}>
                  Invalid payment amount. Please go back and try again.
                </Text>
              </View>
            ) : availableMethods === null ? (
              <ActivityIndicator color={colors.primary.default} style={{ marginVertical: tokens.spacing.lg }} />
            ) : (
              availableMethods.map((method, i) => (
                <Pressable
                  key={method.meta.key}
                  onPress={() => void handlePay(method)}
                  disabled={launching}
                  accessibilityRole="button"
                  accessibilityLabel={method.meta.label}
                  style={({ pressed }) => ({
                    flexDirection:     'row',
                    alignItems:        'center',
                    paddingVertical:   tokens.spacing.md,
                    borderBottomWidth: i < availableMethods.length - 1 ? 1 : 0,
                    borderBottomColor: colors.borderMuted,
                    opacity:           pressed || launching ? 0.7 : 1,
                  })}
                >
                  <View
                    style={{
                      width:           40,
                      height:          40,
                      borderRadius:    tokens.radius.md,
                      backgroundColor: method.meta.iconBg ?? colors.surfaceAlt,
                      alignItems:      'center',
                      justifyContent:  'center',
                      marginRight:     tokens.spacing.md,
                    }}
                  >
                    <Ionicons
                      name={method.meta.iconName as React.ComponentProps<typeof Ionicons>['name']}
                      size={20}
                      color={method.meta.iconColor ?? colors.primary.default}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="label" color={colors.text.primary}>{method.meta.label}</Text>
                    <Text variant="caption" color={colors.text.secondary}>{method.meta.description}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.text.tertiary} />
                </Pressable>
              ))
            )}

            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              style={({ pressed }) => ({
                marginTop:       tokens.spacing.md,
                alignItems:      'center',
                paddingVertical: tokens.spacing.sm,
                opacity:         pressed ? 0.7 : 1,
              })}
            >
              <Text variant="label" color={colors.text.secondary}>Cancel</Text>
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
});
