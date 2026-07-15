import React, { useEffect } from 'react';
import { View, Pressable, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import Animated, {
  ZoomIn,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../../../components/ui/Text';
import { useColors } from '../../../theme/colors';
import { tokens } from '../../../theme/tokens';

const FAB_COMPACT  = 56;
const FAB_EXTENDED = 168;

interface TripFABProps {
  onAddExpense: () => void;
  isExtended: boolean;
}

export function TripFAB({ onAddExpense, isExtended }: TripFABProps) {
  const { t } = useTranslation();
  const colors = useColors();

  const fabWidth     = useSharedValue(FAB_COMPACT);
  const labelOpacity = useSharedValue(0);

  useEffect(() => {
    fabWidth.value     = withSpring(isExtended ? FAB_EXTENDED : FAB_COMPACT, { damping: 15, stiffness: 200 });
    labelOpacity.value = withTiming(isExtended ? 1 : 0, { duration: 200 });
  }, [isExtended, fabWidth, labelOpacity]);

  const animatedFabStyle   = useAnimatedStyle(() => ({ width: fabWidth.value }));
  const animatedLabelStyle = useAnimatedStyle(() => ({ opacity: labelOpacity.value }));

  return (
    <View
      style={{
        position: 'absolute',
        bottom: tokens.spacing.xl,
        right: tokens.spacing.md,
        alignItems: 'flex-end',
        gap: tokens.spacing.sm,
      }}
    >
      {/* Primary: Add expense */}
      <Animated.View
        entering={Platform.OS !== 'web' ? ZoomIn.delay(100).duration(300).springify() : undefined}
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
            onPress={onAddExpense}
            accessibilityRole="button"
            accessibilityLabel={t('trips.detail.add_expense_label')}
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
              <Text variant="label" color="#ffffff">{t('trips.detail.add_expense')}</Text>
            </Animated.View>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </View>
  );
}
